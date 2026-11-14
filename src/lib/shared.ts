import type { SharedGame, SharedType, ShareScope } from "../shared/protocol";
import { load, save } from "./store";

async function j<T>(r: Response): Promise<T> {
  const d = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(d.error ?? "Something went wrong. Try again.");
  return d as T;
}

export const shareUrl = (id: string) => `${location.origin}/g/${id}`;

export const shareGame = (g: { name: string; type: SharedType; lines: string }, scope: ShareScope, author: string) =>
  fetch("/api/games", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...g, scope, author }),
  }).then((r) => j<SharedGame>(r));

export const getShared = (id: string) => fetch(`/api/games/${id}`).then((r) => j<SharedGame>(r));

export const getPublic = () => fetch("/api/games/public").then((r) => j<SharedGame[]>(r));

export const loadCommunity = () => load<SharedGame[]>("gn.community", []);
export const saveCommunity = (l: SharedGame[]) => save("gn.community", l);

export const adminList = (key: string) =>
  fetch("/api/admin/games", { headers: { "x-admin-key": key } }).then((r) => j<SharedGame[]>(r));

export const adminAct = (key: string, id: string, action: "approve" | "reject" | "delete") =>
  fetch(`/api/admin/games/${id}`, {
    method: "POST",
    headers: { "x-admin-key": key, "content-type": "application/json" },
    body: JSON.stringify({ action }),
  }).then((r) => j<unknown>(r));

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
