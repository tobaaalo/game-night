import { DurableObject } from "cloudflare:workers";
import type {
  ClientMsg,
  HostQuestion,
  PublicPlayer,
  RoomState,
  ServerMsg,
  SharedGame,
  SharedType,
} from "../shared/protocol";
import { teamApply, teamStart, type TeamMsg, type TeamState } from "../shared/team";
import { handleApi, json } from "./api";

interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  LIBRARY: DurableObjectNamespace<Library>;
}

export default {
  fetch: (req: Request, env: Env): Promise<Response> => handleApi(req, env),
} satisfies ExportedHandler<Env>;

interface Player {
  pid: string;
  name: string;
  score: number;
}
interface Answer {
  idx: number;
  at: number;
  /** Which clue was showing when the answer was locked in (clue questions only). */
  stage: number;
  /** Answers can be changed once, in case of a mis-tap. */
  changes: number;
}
interface Stored {
  code: string;
  hostKey: string;
  game: string;
  total: number;
  phase: RoomState["phase"];
  players: Player[];
  q?: HostQuestion & { n: number; deadline: number };
  /** Every question for this game. The server moves through them by itself, so nobody has to tap Next. */
  queue?: HostQuestion[];
  qi: number;
  stage: number;
  nextAt?: number;
  nextAct?: "reveal" | "clue" | "next";
  touched: number;
  answers: Record<string, Answer>;
  reveal?: RoomState["reveal"];
  team?: TeamState;
  n: number;
}
interface Tag {
  role: "host" | "player";
  pid?: string;
}

const IDLE_MS = 2 * 60 * 60 * 1000;
/** How long the answer stays on screen before the next question starts by itself. */
const REVEAL_MS = 3500;
/** A short pause after everyone has answered, so a mis-tap can still be fixed. */
const ALL_IN_MS = 1800;

export class Room extends DurableObject<Env> {
  s: Stored | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get<Stored>("s")) ?? null;
    });
  }

  async save() {
    if (this.s) {
      this.s.touched = Date.now();
      await this.ctx.storage.put("s", this.s);
    }
    await this.arm();
  }

  /** One alarm does two jobs: the next automatic step of the game, and closing an abandoned room. */
  async arm() {
    const idle = (this.s?.touched ?? Date.now()) + IDLE_MS;
    const at = this.s?.nextAt ? Math.min(this.s.nextAt, idle) : idle;
    await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 20));
  }

  async alarm() {
    const s = this.s;
    if (s?.nextAt && s.nextAt <= Date.now() + 50) {
      this.step();
      await this.save();
      this.broadcast();
      return;
    }
    if (s && Date.now() - s.touched < IDLE_MS) return this.arm();
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, "Room closed");
    await this.ctx.storage.deleteAll();
    this.s = null;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/claim") {
      if (this.s) return json({ error: "taken" }, 409);
      const hostKey = crypto.randomUUID();
      this.s = {
        code: url.searchParams.get("code") ?? "",
        hostKey,
        game: "",
        total: 0,
        phase: "lobby",
        players: [],
        answers: {},
        qi: -1,
        stage: 0,
        touched: Date.now(),
        n: 0,
      };
      await this.save();
      return json({ hostKey });
    }
    if (!this.s) return json({ error: "No room with that code. Check the letters with the host." }, 404);
    if (url.pathname === "/info")
      return json({ code: this.s.code, game: this.s.game, phase: this.s.phase, players: this.s.players.length });
    // Fallbacks for a weak connection: ask for the latest board, or send a move, with plain requests.
    if (url.pathname === "/poll") {
      const pid = url.searchParams.get("pid") ?? "";
      const known = this.s.players.some((p) => p.pid === pid);
      if (url.searchParams.get("role") === "player" && !known)
        return json({ error: "You're not in this room any more." }, 404);
      if (url.searchParams.get("role") === "player") this.markSeen(pid);
      return json({ state: this.view(), you: pid || undefined });
    }
    if (url.pathname === "/msg" && req.method === "POST") {
      const b = (await req.json().catch(() => null)) as { role?: string; key?: string; pid?: string; msg?: ClientMsg } | null;
      if (!b?.msg) return json({ error: "Bad request." }, 400);
      let tag: Tag;
      if (b.role === "host") {
        if (b.key !== this.s.hostKey) return json({ error: "Only the host can do that." }, 403);
        tag = { role: "host" };
      } else {
        if (!this.s.players.some((p) => p.pid === b.pid)) return json({ error: "You're not in this room any more." }, 404);
        tag = { role: "player", pid: b.pid };
      }
      await this.handle(b.msg, tag, () => undefined);
      return json({ state: this.view(), you: tag.pid });
    }
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
      if (tag.pid) this.markSeen(tag.pid);
      await this.save();
      this.broadcast();
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: "Not found" }, 404);
  }

  /** Players on the plain-request fallback count as connected for a little while. */
  seen = new Map<string, number>();
  markSeen(pid: string) {
    this.seen.set(pid, Date.now());
  }

  connectedPids() {
    const set = new Set<string>();
    let host = false;
    for (const ws of this.ctx.getWebSockets()) {
      const t = ws.deserializeAttachment() as Tag | null;
      if (t?.role === "host") host = true;
      if (t?.pid) set.add(t.pid);
    }
    for (const [pid, at] of this.seen) if (Date.now() - at < 12000) set.add(pid);
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
    const st: RoomState = {
      code: s.code,
      game: s.game,
      phase: s.phase,
      hostConnected: host,
      players,
      total: s.total,
      now: Date.now(),
    };
    if (s.nextAt && s.nextAct === "next") st.nextAt = s.nextAt;
    if (s.q) {
      const { correct: _c, explain: _e, captions: _cap, clues, ...pub } = s.q;
      void _c;
      void _e;
      void _cap;
      st.question = clues
        ? { ...pub, shown: s.phase === "question" ? clues.slice(0, s.stage + 1) : clues, clueCount: clues.length }
        : pub;
    }
    if (s.phase === "reveal" || s.phase === "ended") st.reveal = s.reveal;
    if (s.team) {
      st.team = {
        ...s.team,
        members: [
          { id: "host", name: "Host", here: host },
          ...s.players.map((p) => ({ id: p.pid, name: p.name, here: set.has(p.pid) })),
        ],
      };
    }
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

  /** Starts question number qi, or ends the game after the last one. */
  startQuestion(qi: number) {
    const s = this.s!;
    const q = s.queue?.[qi];
    if (!q) {
      s.phase = "ended";
      s.nextAt = undefined;
      s.nextAct = undefined;
      return;
    }
    s.qi = qi;
    s.n = qi + 1;
    s.stage = 0;
    const now = Date.now();
    s.q = { ...q, n: s.n, deadline: now + q.seconds * 1000 };
    s.answers = {};
    s.reveal = undefined;
    s.phase = "question";
    this.scheduleInQuestion();
  }

  /** The next thing that happens during a question: a new clue, or the answer. */
  scheduleInQuestion() {
    const s = this.s!;
    const q = s.q!;
    const clues = q.clues?.length ?? 0;
    if (clues > 1 && s.stage < clues - 1) {
      const start = q.deadline - q.seconds * 1000;
      s.nextAt = start + ((s.stage + 1) * q.seconds * 1000) / clues;
      s.nextAct = "clue";
    } else {
      s.nextAt = q.deadline + 300;
      s.nextAct = "reveal";
    }
  }

  step() {
    const s = this.s;
    if (!s) return;
    const act = s.nextAct;
    s.nextAt = undefined;
    s.nextAct = undefined;
    if (act === "clue" && s.phase === "question") {
      s.stage++;
      this.scheduleInQuestion();
    } else if (act === "reveal" && s.phase === "question") this.doReveal();
    else if (act === "next" && s.phase === "reveal") this.startQuestion(s.qi + 1);
  }

  doReveal() {
    const s = this.s!;
    if (!s.q || s.phase !== "question") return;
    const picks: Record<string, { idx: number; gained: number }> = {};
    const start = s.q.deadline - s.q.seconds * 1000;
    const clues = s.q.clues?.length ?? 0;
    for (const p of s.players) {
      const a = s.answers[p.pid];
      if (!a) continue;
      let gained = 0;
      if (s.q.correct >= 0 && a.idx === s.q.correct) {
        if (clues) gained = (clues - a.stage) * s.q.points;
        else {
          const speed = Math.max(0, Math.min(1, 1 - (a.at - start) / (s.q.seconds * 1000)));
          gained = Math.round(s.q.points * 100 + speed * 50);
        }
        p.score += gained;
      }
      picks[p.pid] = { idx: a.idx, gained };
    }
    s.reveal = { correct: s.q.correct, explain: s.q.explain, captions: s.q.captions, picks };
    s.phase = "reveal";
    if (s.queue) {
      s.nextAt = Date.now() + REVEAL_MS + (s.q.explain ? 1500 : 0);
      s.nextAct = "next";
    } else s.nextAt = undefined;
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
    await this.handle(msg, tag, (m) => this.send(ws, m));
  }

  async handle(msg: ClientMsg, tag: Tag, reply: (m: ServerMsg) => void) {
    const s = this.s;
    if (!s) return;
    if (msg.t === "ping") return reply({ t: "pong" });
    if (tag.pid) this.markSeen(tag.pid);
    if (msg.t.startsWith("team-")) {
      const id = tag.role === "host" ? "host" : (tag.pid ?? "");
      const order = ["host", ...s.players.map((p) => p.pid)];
      const mix = (a: string[]) => {
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      if (msg.t === "team-start") {
        if (tag.role !== "host") return;
        s.game = "Word Ladder";
        s.phase = "team";
        s.q = undefined;
        s.reveal = undefined;
        s.queue = undefined;
        s.nextAt = undefined;
        s.team = teamStart(msg.vs, msg.within, msg.teams, msg.puzzles.slice(0, 40), order, mix);
      } else if (s.team) {
        const { set, host } = this.connectedPids();
        if (host) set.add("host");
        if (!teamApply(s.team, msg as TeamMsg, id, set)) {
          // Someone else got there first. Send the up-to-date board back so this phone catches up.
          reply({ t: "state", state: this.view(), you: tag.pid });
          return;
        }
      }
      await this.save();
      this.broadcast();
      return;
    }
    if (tag.role === "host") {
      if (msg.t === "setup") {
        s.game = msg.game;
        s.total = msg.total;
        s.n = 0;
        s.qi = -1;
        s.phase = "lobby";
        s.q = undefined;
        s.team = undefined;
        s.reveal = undefined;
        s.nextAt = undefined;
        s.queue = msg.queue?.slice(0, 40);
        s.players.forEach((p) => (p.score = 0));
        if (s.queue?.length) this.startQuestion(0);
      } else if (msg.t === "reveal") this.doReveal();
      else if (msg.t === "end") {
        if (s.phase === "question") this.doReveal();
        s.phase = "ended";
        s.nextAt = undefined;
      } else if (msg.t === "lobby") {
        s.team = undefined;
        s.queue = undefined;
        s.nextAt = undefined;
        s.phase = "lobby";
        s.q = undefined;
        s.reveal = undefined;
      } else if (msg.t === "kick") {
        s.players = s.players.filter((p) => p.pid !== msg.pid);
        for (const w of this.ctx.getWebSockets(msg.pid)) w.close(4000, "Removed by host");
      }
    }
    // Anyone can move on from an answer straight away.
    if (msg.t === "next" && s.phase === "reveal" && s.queue) this.startQuestion(s.qi + 1);
    if (msg.t === "answer" && tag.pid && s.phase === "question" && s.q) {
      const idx = msg.idx;
      if (Number.isInteger(idx) && idx >= 0 && idx < s.q.options.length) {
        const a = s.answers[tag.pid];
        const at = Math.min(Date.now(), s.q.deadline);
        if (!a) s.answers[tag.pid] = { idx, at, stage: s.stage, changes: 0 };
        else if (a.idx !== idx) {
          if (a.changes >= 1) reply({ t: "error", message: "You can only change your answer once." });
          else s.answers[tag.pid] = { idx, at, stage: s.stage, changes: 1 };
        }
        const { set } = this.connectedPids();
        const waiting = s.players.filter((p) => set.has(p.pid) && !s.answers[p.pid]);
        if (waiting.length === 0) {
          s.nextAt = Date.now() + ALL_IN_MS;
          s.nextAct = "reveal";
        }
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

/* ---------- Shared custom games: one small library for the whole site ---------- */
const TYPES: SharedType[] = ["cards", "quiz", "reveal", "timed"];
const ID_CHARS = CODE_CHARS();
function CODE_CHARS() {
  return "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
}
const newId = () => Array.from({ length: 6 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join("");

export class Library extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const store = this.ctx.storage;
    const all = async () => [...(await store.list<SharedGame>({ prefix: "g:" })).values()];

    if (url.pathname === "/create" && req.method === "POST") {
      const ip = url.searchParams.get("ip") ?? "x";
      const hour = Math.floor(Date.now() / 3600000);
      const rk = `r:${hour}:${ip}`;
      const used = (await store.get<number>(rk)) ?? 0;
      if (used >= 10) return json({ error: "That's a lot of games for one hour. Try again later." }, 429);
      let b: Partial<SharedGame> & { scope?: string };
      try {
        b = (await req.json()) as typeof b;
      } catch {
        return json({ error: "Bad request." }, 400);
      }
      const name = String(b.name ?? "")
        .trim()
        .slice(0, 60);
      const lines = String(b.lines ?? "")
        .trim()
        .slice(0, 12000);
      const type = b.type as SharedType;
      const scope = b.scope === "public" ? "public" : "link";
      if (!name || !TYPES.includes(type) || lines.split("\n").filter(Boolean).length < 2)
        return json({ error: "A game needs a name and at least two lines." }, 400);
      if (lines.split("\n").length > 300) return json({ error: "That's too long. Keep it under 300 lines." }, 400);
      let id = newId();
      while (await store.get(`g:${id}`)) id = newId();
      const g: SharedGame = {
        id,
        name,
        type,
        lines,
        scope,
        status: scope === "public" ? "pending" : "link",
        author: String(b.author ?? "")
          .trim()
          .slice(0, 30),
        created: Date.now(),
      };
      await store.put(`g:${id}`, g);
      await store.put(rk, used + 1);
      return json(g);
    }
    if (url.pathname === "/get") {
      const g = await store.get<SharedGame>(`g:${url.searchParams.get("id")}`);
      if (!g || g.status === "rejected" || g.status === "pending") return json({ error: "Game not found." }, 404);
      return json(g);
    }
    if (url.pathname === "/public") {
      const list = (await all()).filter((g) => g.status === "approved").sort((a, b) => b.created - a.created);
      return json(list.slice(0, 100));
    }
    if (url.pathname === "/all") {
      const list = (await all()).sort((a, b) => b.created - a.created);
      return json(list.slice(0, 200));
    }
    if (url.pathname === "/act" && req.method === "POST") {
      const id = url.searchParams.get("id");
      const g = await store.get<SharedGame>(`g:${id}`);
      if (!g) return json({ error: "Not found." }, 404);
      const { action } = (await req.json()) as { action: string };
      if (action === "delete") {
        await store.delete(`g:${id}`);
        return json({ ok: true });
      }
      if (action === "approve") g.status = "approved";
      else if (action === "reject") g.status = "rejected";
      else return json({ error: "Unknown action." }, 400);
      await store.put(`g:${id}`, g);
      return json(g);
    }
    return json({ error: "Not found." }, 404);
  }
}
