import { load, save } from "./store";

export interface Keepsake {
  id: string;
  q: string;
  a: string;
  who: string;
  at: number;
}
const KEY = "gn.scrapbook";
export const loadKeepsakes = () => load<Keepsake[]>(KEY, []);
export const saveKeepsakes = (l: Keepsake[]) => save(KEY, l.slice(0, 300));
export function keep(k: Omit<Keepsake, "id" | "at">) {
  const list = loadKeepsakes();
  saveKeepsakes([{ ...k, id: Math.random().toString(36).slice(2, 8), at: Date.now() }, ...list]);
}
