import type { Library, Room } from "./index";
import { CODE_ALPHABET, type SharedGame } from "../shared/protocol";

export interface ApiEnv {
  ROOMS: DurableObjectNamespace<Room>;
  /** Shared games. Optional so the rest of the app still works until the binding is added. */
  LIBRARY?: DurableObjectNamespace<Library>;
  /** Secret that opens the review page. */
  ADMIN_KEY?: string;
  /** Your private ntfy channel name, for phone alerts about new shared games. */
  NTFY_TOPIC?: string;
}

const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function notify(env: ApiEnv, origin: string, g: SharedGame) {
  if (!env.NTFY_TOPIC) return;
  const lines = g.lines.split("\n").filter(Boolean).length;
  const pub = g.scope === "public";
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(env.NTFY_TOPIC)}`, {
      method: "POST",
      headers: {
        Title: pub ? "New game waiting for approval" : "New game shared by link",
        Click: `${origin}/review`,
        Tags: pub ? "hourglass" : "link",
      },
      body: `"${g.name.slice(0, 60)}" by ${g.author || "someone"} (${lines} lines)`,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* an alert that fails must never block the game being shared */
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const newCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

export async function handleApi(req: Request, env: ApiEnv): Promise<Response> {
  if (!env.ROOMS) return json({ error: "Rooms are not connected on this deployment (ROOMS binding missing)." }, 503);
  try {
    return await route(req, env);
  } catch (e) {
    return json({ error: `Room service error: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
}

async function route(req: Request, env: ApiEnv): Promise<Response> {
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
  const m = url.pathname.match(/^\/api\/rooms\/([A-Z]{4})(\/ws|\/poll|\/msg)?$/);
  if (m) {
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    const inner = new URL(req.url);
    inner.pathname = m[2] ?? "/info";
    return stub.fetch(new Request(inner.toString(), req));
  }
  if (url.pathname.startsWith("/api/games") || url.pathname.startsWith("/api/admin/")) return games(req, env, url);
  return json({ error: "Not found" }, 404);
}

async function games(req: Request, env: ApiEnv, url: URL): Promise<Response> {
  if (!env.LIBRARY) return json({ error: "Sharing isn't switched on for this site yet." }, 503);
  const lib = env.LIBRARY.get(env.LIBRARY.idFromName("main"));
  const call = (path: string, init?: RequestInit) => lib.fetch(`https://lib${path}`, init);

  if (url.pathname.startsWith("/api/admin/")) {
    const key = req.headers.get("x-admin-key") ?? "";
    if (!env.ADMIN_KEY || !same(key, env.ADMIN_KEY)) return json({ error: "Wrong key." }, 401);
    if (url.pathname === "/api/admin/games" && req.method === "GET") return call("/all");
    const m = url.pathname.match(/^\/api\/admin\/games\/([A-Za-z0-9]{6})$/);
    if (m && req.method === "POST") return call(`/act?id=${m[1]}`, { method: "POST", body: await req.text() });
    return json({ error: "Not found" }, 404);
  }
  if (url.pathname === "/api/games" && req.method === "POST") {
    const ip = req.headers.get("cf-connecting-ip") ?? "x";
    const r = await call(`/create?ip=${encodeURIComponent(ip)}`, { method: "POST", body: await req.text() });
    if (r.ok) {
      const g = (await r.clone().json()) as SharedGame;
      await notify(env, url.origin, g);
    }
    return r;
  }
  if (url.pathname === "/api/games/public" && req.method === "GET") return call("/public");
  const m = url.pathname.match(/^\/api\/games\/([A-Za-z0-9]{6})$/);
  if (m && req.method === "GET") return call(`/get?id=${m[1].toUpperCase()}`);
  return json({ error: "Not found" }, 404);
}
