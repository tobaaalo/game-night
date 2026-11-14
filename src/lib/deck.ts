import { load, save } from "./store";

/** Fisher–Yates shuffle, returns a new array. */
export function shuffle<T>(a: readonly T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

interface Seen {
  seen: string[];
  recent: string[];
}

const RECENT = 12;
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const defaultId = (x: unknown) => hash(typeof x === "string" ? x : JSON.stringify(x));

/**
 * Pick `n` items from `pool` that this device has not seen yet.
 * The memory is per "bank" (not per level), so Easy then Mixed never replays the same question.
 * Nothing repeats until every item in the pool has been used; then only that pool resets, and the
 * last dozen items are held back so a question never comes round twice in a row.
 */
export function drawFresh<T>(bank: string, pool: readonly T[], n: number, id: (t: T) => string = defaultId): T[] {
  if (!pool.length || n <= 0) return [];
  const k = `gn.seen2.${bank}`;
  const st = load<Seen>(k, { seen: [], recent: [] });
  const seen = new Set(st.seen);
  const recent = new Set(st.recent);
  const chosen: T[] = [];
  const chosenIds = new Set<string>();
  const want = Math.min(n, pool.length);
  while (chosen.length < want) {
    let cand = pool.filter((x) => !seen.has(id(x)) && !chosenIds.has(id(x)));
    if (!cand.length) {
      for (const x of pool) seen.delete(id(x));
      cand = pool.filter((x) => !chosenIds.has(id(x)));
    }
    const fresh = cand.filter((x) => !recent.has(id(x)));
    const x = pick(fresh.length ? fresh : cand);
    chosen.push(x);
    chosenIds.add(id(x));
    seen.add(id(x));
  }
  const recentOut = [...st.recent, ...chosen.map(id)].slice(-RECENT);
  save(k, { seen: [...seen].slice(-6000), recent: recentOut });
  return chosen;
}

export const draw = <T>(bank: string, items: readonly T[]): T => drawFresh(bank, items, 1)[0];
export const drawMany = <T>(bank: string, items: readonly T[], n: number): T[] => drawFresh(bank, items, n);

export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
