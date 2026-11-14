import { DurableObject } from "cloudflare:workers";
import type { ClientMsg, HostQuestion, PublicPlayer, RoomState, ServerMsg } from "../shared/protocol";
import { CODE_ALPHABET } from "../shared/protocol";

interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const newCode = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/rooms" && req.method === "POST") {
      for (let i = 0; i < 6; i++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch(`https://room/claim?code=${code}`, { method: "POST" });
        if (r.ok) {
          const { hostKey } = (await r.json()) as { hostKey: string };
          return json({ code, hostKey });
        }
      }
      return json({ error: "Couldn't make a room right now. Try again in a moment." }, 503);
    }
    const m = url.pathname.match(/^\/api\/rooms\/([A-Z]{4})(\/ws)?$/);
    if (m) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      const inner = new URL(req.url);
      inner.pathname = m[2] ? "/ws" : "/info";
      return stub.fetch(new Request(inner.toString(), req));
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

interface Player {
  pid: string;
  name: string;
  score: number;
}
interface Stored {
  code: string;
  hostKey: string;
  game: string;
  total: number;
  phase: RoomState["phase"];
  players: Player[];
  q?: HostQuestion & { n: number; deadline: number };
  answers: Record<string, { idx: number; at: number }>;
  reveal?: RoomState["reveal"];
  n: number;
}
interface Tag {
  role: "host" | "player";
  pid?: string;
}

const IDLE_MS = 2 * 60 * 60 * 1000;

export class Room extends DurableObject<Env> {
  s: Stored | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get<Stored>("s")) ?? null;
    });
  }

  async save() {
    if (this.s) await this.ctx.storage.put("s", this.s);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
  }

  async alarm() {
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, "Room closed");
    await this.ctx.storage.deleteAll();
    this.s = null;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/claim") {
      if (this.s) return json({ error: "taken" }, 409);
      const hostKey = crypto.randomUUID();
      this.s = { code: url.searchParams.get("code") ?? "", hostKey, game: "", total: 0, phase: "lobby", players: [], answers: {}, n: 0 };
      await this.save();
      return json({ hostKey });
    }
    if (!this.s) return json({ error: "No room with that code. Check the letters with the host." }, 404);
    if (url.pathname === "/info") return json({ code: this.s.code, game: this.s.game, phase: this.s.phase, players: this.s.players.length });
    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return json({ error: "Expected a WebSocket" }, 426);
      const role = url.searchParams.get("role");
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      let tag: Tag;
      if (role === "host") {
        if (url.searchParams.get("key") !== this.s.hostKey) return json({ error: "Only the host can do that." }, 403);
        tag = { role: "host" };
      } else {
        const name = (url.searchParams.get("name") ?? "").trim().slice(0, 20);
        let pid = url.searchParams.get("pid") ?? "";
        if (!name) return json({ error: "Type your name first." }, 400);
        const existing = this.s.players.find((p) => p.pid === pid);
        if (existing) existing.name = name;
        else {
          if (this.s.players.length >= 16) return json({ error: "This room is full (16 players)." }, 409);
          if (this.s.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
            return json({ error: `Someone called ${name} is already in. Add an initial or a nickname.` }, 409);
          pid = crypto.randomUUID().slice(0, 8);
          this.s.players.push({ pid, name, score: 0 });
        }
        tag = { role: "player", pid };
      }
      this.ctx.acceptWebSocket(server, [tag.role, tag.pid ?? "host"]);
      server.serializeAttachment(tag);
      await this.save();
      this.broadcast();
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: "Not found" }, 404);
  }

  connectedPids() {
    const set = new Set<string>();
    let host = false;
    for (const ws of this.ctx.getWebSockets()) {
      const t = ws.deserializeAttachment() as Tag | null;
      if (t?.role === "host") host = true;
      if (t?.pid) set.add(t.pid);
    }
    return { set, host };
  }

  view(): RoomState {
    const s = this.s!;
    const { set, host } = this.connectedPids();
    const players: PublicPlayer[] = s.players.map((p) => ({
      pid: p.pid,
      name: p.name,
      score: p.score,
      connected: set.has(p.pid),
      answered: s.phase === "question" && !!s.answers[p.pid],
    }));
    const st: RoomState = { code: s.code, game: s.game, phase: s.phase, hostConnected: host, players, total: s.total };
    if (s.q) {
      const { correct: _c, explain: _e, captions: _cap, ...pub } = s.q;
      void _c;
      void _e;
      void _cap;
      st.question = pub;
    }
    if (s.phase === "reveal" || s.phase === "ended") st.reveal = s.reveal;
    return st;
  }

  send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket already gone */
    }
  }

  broadcast() {
    if (!this.s) return;
    const state = this.view();
    for (const ws of this.ctx.getWebSockets()) {
      const t = ws.deserializeAttachment() as Tag | null;
      this.send(ws, { t: "state", state, you: t?.pid });
    }
  }

  doReveal() {
    const s = this.s!;
    if (!s.q || s.phase !== "question") return;
    const picks: Record<string, { idx: number; gained: number }> = {};
    const start = s.q.deadline - s.q.seconds * 1000;
    for (const p of s.players) {
      const a = s.answers[p.pid];
      if (!a) continue;
      let gained = 0;
      if (a.idx === s.q.correct) {
        const speed = Math.max(0, Math.min(1, 1 - (a.at - start) / (s.q.seconds * 1000)));
        gained = Math.round(s.q.points * 100 + speed * 50);
        p.score += gained;
      }
      picks[p.pid] = { idx: a.idx, gained };
    }
    s.reveal = { correct: s.q.correct, explain: s.q.explain, captions: s.q.captions, picks };
    s.phase = "reveal";
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (!this.s || typeof raw !== "string") return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw) as ClientMsg;
    } catch {
      return;
    }
    const tag = ws.deserializeAttachment() as Tag;
    const s = this.s;
    if (msg.t === "ping") return this.send(ws, { t: "pong" });
    if (tag.role === "host") {
      if (msg.t === "setup") {
        s.game = msg.game;
        s.total = msg.total;
        s.n = 0;
        s.phase = "lobby";
        s.q = undefined;
        s.reveal = undefined;
        s.players.forEach((p) => (p.score = 0));
      } else if (msg.t === "question") {
        s.n += 1;
        s.q = { ...msg.q, n: s.n, deadline: Date.now() + msg.q.seconds * 1000 };
        s.answers = {};
        s.reveal = undefined;
        s.phase = "question";
        await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
      } else if (msg.t === "reveal") this.doReveal();
      else if (msg.t === "end") {
        if (s.phase === "question") this.doReveal();
        s.phase = "ended";
      } else if (msg.t === "lobby") {
        s.phase = "lobby";
        s.q = undefined;
        s.reveal = undefined;
      } else if (msg.t === "kick") {
        s.players = s.players.filter((p) => p.pid !== msg.pid);
        for (const w of this.ctx.getWebSockets(msg.pid)) w.close(4000, "Removed by host");
      }
    } else if (msg.t === "answer" && tag.pid && s.phase === "question" && s.q) {
      if (!s.answers[tag.pid] && Number.isInteger(msg.idx) && msg.idx >= 0 && msg.idx < s.q.options.length) {
        s.answers[tag.pid] = { idx: msg.idx, at: Math.min(Date.now(), s.q.deadline) };
        const { set } = this.connectedPids();
        const waiting = s.players.filter((p) => set.has(p.pid) && !s.answers[p.pid]);
        if (waiting.length === 0) this.doReveal();
      }
    }
    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, "bye");
    } catch {
      /* ignore */
    }
    this.broadcast();
  }

  async webSocketError() {
    this.broadcast();
  }
}
