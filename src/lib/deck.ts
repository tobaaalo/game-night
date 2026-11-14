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

interface DeckState {
  len: number;
  order: number[];
  pos: number;
  recent: number[];
}

const RECENT = 5;

/**
 * Draw the next index from a remembered deck.
 * Guarantees: no index repeats within 5 draws; when the deck runs out it is reshuffled
 * at random; position survives reloads.
 */
export function drawIndex(key: string, len: number): number {
  if (len <= 0) return -1;
  const k = `gn.deck.${key}`;
  let s = load<DeckState | null>(k, null);
  if (!s || s.len !== len || !Array.isArray(s.order)) s = { len, order: [], pos: 0, recent: [] };
  if (s.pos >= s.order.length) {
    let o = shuffle([...Array(len).keys()]);
    if (len > RECENT * 2) {
      const rec = new Set(s.recent);
      const early = o.slice(0, RECENT).filter((x) => rec.has(x));
      o = o.filter((x) => !early.includes(x));
      for (const x of early) o.splice(RECENT + Math.floor(Math.random() * (o.length - RECENT + 1)), 0, x);
    }
    s.order = o;
    s.pos = 0;
  }
  const idx = s.order[s.pos++];
  s.recent = [...s.recent, idx].slice(-RECENT);
  save(k, s);
  return idx;
}

export const draw = <T>(key: string, items: readonly T[]): T => items[drawIndex(`${key}|${items.length}`, items.length)];

export function drawMany<T>(key: string, items: readonly T[], n: number): T[] {
  const out: T[] = [];
  const count = Math.min(n, items.length);
  for (let i = 0; i < count; i++) out.push(draw(key, items));
  return out;
}

export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
