// Safe local storage: never throws, falls back to memory (private mode, blocked storage).
const mem = new Map<string, string>();

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw) as T;
  } catch {
    const raw = mem.get(key);
    if (raw != null) return JSON.parse(raw) as T;
  }
  return fallback;
}

export function save(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  mem.set(key, raw);
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* storage full or blocked: memory copy keeps this session working */
  }
}

export function remove(key: string) {
  mem.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
