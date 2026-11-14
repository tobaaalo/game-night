import type { Room } from "./index";
import { CODE_ALPHABET } from "../shared/protocol";

export interface ApiEnv {
  ROOMS: DurableObjectNamespace<Room>;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const newCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

export async function handleApi(req: Request, env: ApiEnv): Promise<Response> {
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
  return json({ error: "Not found" }, 404);
}
