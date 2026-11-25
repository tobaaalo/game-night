import type { HostQuestion } from "../shared/protocol";
import {
  AITEXT,
  ATHLETES,
  BIBLE,
  FACES,
  HOLDATA,
  ODDONE,
  PAIRS,
  TRIVIA,
  YEARS,
  levelName,
  type QuizItem,
  type World,
} from "../content";
import { draw, drawFresh, drawMany, pick, shuffle } from "../lib/deck";
import { load, save } from "../lib/store";

export type WorldMode = "flag" | "shape" | "cap" | "fact" | "slang" | "mix";

export interface QuizSetup {
  level: number;
  count: number;
  mode?: string;
  cats?: string[];
  eras?: string[];
}

const SECONDS = 20;

function fromQuizItems(key: string, bank: QuizItem[], s: QuizSetup): HostQuestion[] {
  const pool = bank.filter(
    (q) => (!s.level || q[0] === s.level) && (!s.cats?.length || s.cats.includes(q[3] ?? "General")),
  );
  return drawMany(key, pool, s.count).map(([lv, q, opts]) => {
    const order = shuffle(opts);
    return {
      prompt: q,
      options: order,
      correct: order.indexOf(opts[0]),
      seconds: SECONDS,
      points: Math.max(1, lv),
      label: levelName(lv),
      explain: `The answer is ${opts[0]}.`,
    };
  });
}

export const bibleQuestions = (s: QuizSetup) => fromQuizItems("bible", BIBLE, s);
export const triviaQuestions = (s: QuizSetup) => fromQuizItems("trivia", TRIVIA, s);

interface Person {
  id: string;
  name: string;
  level: number;
  g: "m" | "f" | "x";
}

function poolFor<T extends Person>(all: T[], level: number): T[] {
  const pool = all.filter((f) => !level || f.level === level);
  return pool.length >= 8 ? pool : all;
}

export function facePool(level: number, cats?: string[]) {
  const inCats = FACES.filter((f) => !cats || cats.includes(f.cat));
  return poolFor(inCats.length >= 8 ? inCats : FACES, level);
}

export function athletePool(level: number, sports?: string[], eras?: string[]) {
  const ok = (a: (typeof ATHLETES)[number]) => {
    if (sports && !a.sports.some((x) => sports.includes(x))) return false;
    if (eras && a.eras.length && !a.eras.some((e) => eras.includes(e))) return false;
    return true;
  };
  const inSport = ATHLETES.filter(ok);
  return poolFor(inSport.length >= 8 ? inSport : ATHLETES, level);
}

/**
 * Wrong answers that can't be ruled out: same gender, same field, similar fame.
 * They are drawn from the same no-repeat deck as the answers, so a face is never shown twice
 * (as an answer or an option) until the whole deck has been used.
 */
export function lookalikes<T extends Person>(
  f: T,
  all: T[],
  group: (x: T) => string,
  n: number,
  used: Set<string>,
  bank: string,
): T[] {
  const rest = all.filter((x) => x.id !== f.id);
  const sex = rest.filter((x) => x.g === f.g || x.g === "x" || f.g === "x");
  const near = (x: T) => Math.abs(x.level - f.level) <= 1;
  const tiers = [
    sex.filter((x) => group(x) === group(f) && near(x)),
    sex.filter((x) => group(x) === group(f)),
    sex.filter(near),
    sex,
    rest,
  ];
  const out: T[] = [];
  for (const t of tiers) {
    const need = n - out.length;
    if (need <= 0) break;
    const c = t.filter((x) => !used.has(x.name) && !out.includes(x));
    out.push(...drawFresh(bank, c, need, (x) => x.id));
  }
  return out;
}

function personQuestion<T extends Person>(
  f: T,
  all: T[],
  group: (x: T) => string,
  alt: string,
  used: Set<string>,
  bank: string,
): HostQuestion {
  const same = lookalikes(f, all, group, 3, used, bank);
  same.forEach((x) => used.add(x.name));
  const options = shuffle([f.name, ...same.map((x) => x.name)]);
  return {
    prompt: "Who is this?",
    media: { type: "image", src: `/faces/${f.id}.jpg`, alt },
    options,
    correct: options.indexOf(f.name),
    seconds: 15,
    points: Math.max(1, f.level),
    label: levelName(f.level),
    explain: `That's ${f.name}.`,
  };
}

export function faceQuestions(s: QuizSetup): HostQuestion[] {
  const picked = drawFresh("faces", facePool(s.level, s.cats), s.count, (x) => x.id);
  const used = new Set(picked.map((f) => f.name));
  return picked.map((f) => personQuestion(f, FACES, (x) => x.cat, "A famous face", used, "faces"));
}

export function athleteQuestions(s: QuizSetup): HostQuestion[] {
  const picked = drawFresh("sports", athletePool(s.level, s.cats, s.eras), s.count, (x) => x.id);
  const used = new Set(picked.map((f) => f.name));
  return picked.map((f) => personQuestion(f, ATHLETES, (x) => x.sports[0], "A sports star", used, "sports"));
}

export function realAiQuestions(s: QuizSetup): HostQuestion[] {
  const texts = s.mode === "text";
  type It = { kind: "t"; t: [string, string, string, number] } | { kind: "p"; p: (typeof PAIRS)[number] };
  const items: It[] = texts
    ? AITEXT.filter((t) => !s.level || t[3] === s.level).map((t) => ({ kind: "t" as const, t }))
    : PAIRS.map((p) => ({ kind: "p" as const, p }));
  return drawMany(texts ? "realai-text" : "realai-pic", items, s.count).map((it) => {
    const askAI = Math.random() < 0.5;
    const aiFirst = Math.random() < 0.5;
    let a: { src?: string; text?: string };
    let b: { src?: string; text?: string };
    let topic: string;
    if (it.kind === "t") {
      const [tp, human, ai] = it.t;
      topic = tp;
      a = { text: aiFirst ? ai : human };
      b = { text: aiFirst ? human : ai };
    } else {
      topic = it.p.name;
      const real = `/realai/${it.p.id}-real.jpg`;
      const fake = `/realai/${it.p.id}-ai.jpg`;
      a = { src: aiFirst ? fake : real };
      b = { src: aiFirst ? real : fake };
    }
    const aiIdx = aiFirst ? 0 : 1;
    const correct = askAI ? aiIdx : 1 - aiIdx;
    return {
      prompt: askAI ? "Which one is AI?" : "Which one is real?",
      media: { type: "pair", a, b },
      options: ["A", "B"],
      correct,
      seconds: 20,
      points: 1,
      label: topic,
      explain: `${aiFirst ? "A" : "B"} was made by AI. ${aiFirst ? "B" : "A"} is real.`,
      captions: aiFirst ? ["AI", "Real"] : ["Real", "AI"],
    };
  });
}

type WKind = "flag" | "shape" | "cap" | "capr" | "fact" | "slang" | "cur" | "lang" | "bor" | "ll" | "reg";
interface WItem {
  k: World["countries"][number];
  kind: WKind;
  /** Extra detail: the neighbour for "bor", the currency or language for "cur" and "lang". */
  x?: string;
  lv: number;
}
const KINDS_BY_MODE: Record<string, WKind[]> = {
  flag: ["flag"],
  shape: ["shape"],
  cap: ["cap", "capr"],
  fact: ["fact", "cur", "lang", "bor", "ll", "reg"],
  slang: ["slang"],
};
/** Countries with more than one capital in common use, so "the capital of X" has more than one right answer. */
const SPLIT_CAPITAL = new Set(["za", "bo", "sz", "nl", "my", "lk", "tz", "ci", "bj", "il"]);

/** Every question World Decoder can ask. Over two thousand, each with a level. */
export function worldItems(w: World, mode: string): WItem[] {
  const by = new Map(w.countries.map((c) => [c.c, c]));
  const kinds = mode === "mix" ? Object.values(KINDS_BY_MODE).flat() : (KINDS_BY_MODE[mode] ?? ["flag"]);
  const out: WItem[] = [];
  for (const k of w.countries) {
    for (const kind of kinds) {
      const item = { k, kind, lv: k.lv };
      if (kind === "capr") {
        if (!SPLIT_CAPITAL.has(k.c)) out.push(item);
      } else if (kind === "flag" || kind === "cap" || kind === "reg") out.push(item);
      else if (kind === "shape") {
        if (k.shape) out.push(item);
      } else if (kind === "fact") {
        if (w.facts[k.c]) out.push(item);
      } else if (kind === "slang") {
        if (w.slang[k.c]) out.push(item);
      } else if (kind === "cur") {
        if (k.cur.length === 1) out.push({ k, kind, x: k.cur[0], lv: k.lv });
      } else if (kind === "lang") {
        for (const l of k.lang.slice(0, 2)) out.push({ k, kind, x: l, lv: k.lv });
      } else if (kind === "bor") {
        for (const b of k.bor) {
          const n = by.get(b);
          if (n) out.push({ k, kind, x: n.c, lv: Math.max(k.lv, n.lv) });
        }
      } else if (kind === "ll") {
        if (k.ll) out.push(item);
      }
    }
  }
  return out;
}

export function worldQuestions(w: World, s: QuizSetup): HostQuestion[] {
  const mode = s.mode ?? "flag";
  const all = worldItems(w, mode);
  let pool = all.filter((i) => !s.level || i.lv === s.level);
  if (pool.length < Math.max(s.count, 12)) pool = all;
  const by = new Map(w.countries.map((c) => [c.c, c]));
  const picked = drawFresh(`world|${mode}`, pool, s.count, (i) => `${i.kind}|${i.k.c}|${i.x ?? ""}`);
  return picked.map((it) => {
    const { k, kind } = it;
    const others = w.countries.filter((c) => c !== k);
    // Wrong answers of similar fame first, so the level of a country never gives the answer away.
    const near = (list: typeof others, n: number) => {
      const same = shuffle(list.filter((c) => c.lv === k.lv));
      const rest = shuffle(list.filter((c) => c.lv !== k.lv));
      return [...same, ...rest].slice(0, n);
    };
    const base = {
      seconds: 20,
      points: Math.max(1, it.lv),
      label: levelName(it.lv),
    };
    const ask = (
      right: string,
      wrong: string[],
      extra: Omit<HostQuestion, "options" | "correct" | keyof typeof base>,
    ) => {
      const options = shuffle([right, ...wrong.slice(0, 3)]);
      return { ...base, ...extra, options, correct: options.indexOf(right) } as HostQuestion;
    };
    const fact = w.facts[k.c];
    const tail = `Capital: ${k.cap}.`;
    const names = (list: typeof others) => near(list, 3).map((c) => c.n);
    switch (kind) {
      case "shape":
        return ask(k.n, names(others), {
          prompt: "Which country has this shape?",
          media: { type: "shape", d: k.shape ?? "" },
          explain: `It's ${k.n}. ${tail}`,
        });
      case "cap":
        return ask(k.n, names(others), {
          prompt: "Which country has this capital city?",
          media: { type: "big", text: k.cap },
          explain: `It's ${k.n}. ${fact ?? ""}`,
        });
      case "capr": {
        const caps = near(
          others.filter((c) => c.cap !== k.cap),
          3,
        ).map((c) => c.cap);
        return ask(k.cap, caps, {
          prompt: `What is the capital of ${k.n}?`,
          explain: `${k.cap} is the capital of ${k.n}.`,
        });
      }
      case "fact":
        return ask(k.n, names(others), {
          prompt: "Which country is this?",
          media: { type: "big", text: fact ?? "" },
          explain: `It's ${k.n}. ${tail}`,
        });
      case "slang": {
        const sl = pick(w.slang[k.c]);
        return ask(k.n, names(others.filter((c) => w.slang[c.c])), {
          prompt: "Where would you hear people say this?",
          media: { type: "big", text: `“${sl[0]}”` },
          explain: `It's ${k.n}. “${sl[0]}” means ${sl[1]}.`,
        });
      }
      case "cur":
        return ask(k.n, names(others.filter((c) => !c.cur.includes(it.x ?? ""))), {
          prompt: `Which of these countries uses the ${it.x}?`,
          explain: `${k.n} uses the ${it.x}. ${tail}`,
        });
      case "lang":
        return ask(k.n, names(others.filter((c) => !c.lang.includes(it.x ?? ""))), {
          prompt: `Which of these countries has ${it.x} as an official language?`,
          explain: `${it.x} is an official language of ${k.n}. ${tail}`,
        });
      case "bor": {
        const n = by.get(it.x ?? "");
        return ask(k.n, names(others.filter((c) => c !== n && !n?.bor.includes(c.c))), {
          prompt: `Which of these countries shares a border with ${n?.n}?`,
          explain: `${k.n} borders ${n?.n}. ${tail}`,
        });
      }
      case "ll":
        return ask(k.n, names(others.filter((c) => !c.ll)), {
          prompt: "Which of these countries has no coastline?",
          explain: `${k.n} is landlocked. ${tail}`,
        });
      case "reg":
        return ask(k.n, names(others.filter((c) => c.reg !== k.reg)), {
          prompt: `Which of these countries is in ${k.reg}?`,
          explain: `${k.n} is in ${k.reg}. ${tail}`,
        });
      default:
        return ask(k.n, names(others), {
          prompt: "Which country's flag is this?",
          media: { type: "flag", code: k.c },
          explain: `It's ${k.n}. ${tail} ${fact ?? ""}`,
        });
    }
  });
}

/** Quick check used by tests and the library: pools per level. */
export const countBy = (bank: QuizItem[], level: number) => bank.filter((q) => !level || q[0] === level).length;
export { draw };

const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-GB") : String(n));

const HOLWORDS: Record<string, { hi: string; lo: string; unit: string; ask: string }> = {
  "Mountain height (metres)": { hi: "Taller", lo: "Shorter", unit: " m", ask: "How tall is the mountain?" },
  "River length (km)": { hi: "Longer", lo: "Shorter", unit: " km", ask: "How long is the river?" },
  "Population (millions, roughly)": {
    hi: "More people",
    lo: "Fewer people",
    unit: " million",
    ask: "How many people live there?",
  },
  "Land area (thousand sq km)": {
    hi: "Bigger",
    lo: "Smaller",
    unit: " thousand sq km",
    ask: "How big is the country?",
  },
  "Height (metres)": { hi: "Taller", lo: "Shorter", unit: " m", ask: "How tall is it?" },
  "Top speed (km/h)": { hi: "Faster", lo: "Slower", unit: " km/h", ask: "How fast can it go?" },
  "Diameter (km)": { hi: "Bigger", lo: "Smaller", unit: " km", ask: "How wide is it?" },
};

/** Higher or Lower: harder levels compare numbers that are closer together. */
export function higherLowerQuestions(s: QuizSetup): HostQuestion[] {
  type P = { cat: string; a: [string, number]; b: [string, number]; lv: number };
  const all: P[] = [];
  for (const [cat, items] of Object.entries(HOLDATA))
    for (const a of items)
      for (const b of items) {
        if (a === b || a[1] === b[1]) continue;
        const r = Math.max(a[1], b[1]) / Math.min(a[1], b[1]);
        const lv = r >= 4 ? 1 : r >= 2 ? 2 : r >= 1.35 ? 3 : 4;
        all.push({ cat, a, b, lv });
      }
  let pool = all.filter((p) => !s.level || p.lv === s.level);
  if (pool.length < 20) pool = all;
  // A pair is the same pair whichever way round it is asked, and things used in the last few games rest for a while.
  const pairId = (x: P) => [x.a[0], x.b[0]].sort().join("|");
  const half = pool.filter((x) => x.a[0] < x.b[0]);
  const RECENT_KEY = "gn.holrecent";
  const recentThings = new Set(load<string[]>(RECENT_KEY, []));
  const rested = half.filter((x) => !recentThings.has(x.a[0]) && !recentThings.has(x.b[0]));
  const source = rested.length >= s.count * 4 ? rested : half;
  const seen = new Set<string>();
  const picked: P[] = [];
  for (const p0 of drawFresh("hol2", source, Math.min(source.length, s.count * 6), pairId)) {
    if (picked.length >= s.count) break;
    if (seen.has(p0.a[0]) || seen.has(p0.b[0])) continue;
    seen.add(p0.a[0]);
    seen.add(p0.b[0]);
    // Which one is shown and which one is asked about is random.
    picked.push(Math.random() < 0.5 ? p0 : { ...p0, a: p0.b, b: p0.a });
  }
  save(RECENT_KEY, [...recentThings, ...seen].slice(-Math.max(40, s.count * 6)));
  return picked.map((p) => {
    const w = HOLWORDS[p.cat] ?? { hi: "Higher", lo: "Lower", unit: "" };
    const higher = p.b[1] > p.a[1];
    const show = (n: number) => `${fmt(n)}${w.unit}`;
    return {
      prompt: `Is ${p.b[0]} ${w.hi.toLowerCase()} or ${w.lo.toLowerCase()} than ${p.a[0]}?`,
      media: { type: "big" as const, text: `${p.a[0]}: ${show(p.a[1])}`, sub: w.ask },
      options: [w.hi, w.lo],
      correct: higher ? 0 : 1,
      seconds: 15,
      points: p.lv,
      label: levelName(p.lv),
      explain: `${p.b[0]} is ${show(p.b[1])}, so it is ${higher ? w.hi.toLowerCase() : w.lo.toLowerCase()} than ${p.a[0]}.`,
    };
  });
}

export function oddOneQuestions(s: QuizSetup): HostQuestion[] {
  let pool = ODDONE.filter((o) => !s.level || o[0] === s.level);
  if (pool.length < 8) pool = ODDONE;
  // Draw extra, then keep only questions that share no option with one already chosen,
  // so nothing repeats (or half-repeats) inside a single game.
  const cand = drawFresh("oddone2", pool, Math.min(pool.length, s.count * 3), (o) => o[2].toLowerCase());
  const used = new Set<string>();
  const picked: typeof pool = [];
  for (const o of cand) {
    if (picked.length >= s.count) break;
    if (o[1].some((x) => used.has(x.toLowerCase()))) continue;
    o[1].forEach((x) => used.add(x.toLowerCase()));
    picked.push(o);
  }
  for (const o of cand) if (picked.length < s.count && !picked.includes(o)) picked.push(o);
  return picked.map(([lv, opts, odd, why]) => {
    const order = shuffle(opts);
    return {
      prompt: "Which one is the odd one out?",
      options: order,
      correct: order.indexOf(odd),
      seconds: 20,
      points: lv,
      label: levelName(lv),
      explain: `${odd}. ${why}`,
    };
  });
}

export function yearQuestions(s: QuizSetup): HostQuestion[] {
  const now = new Date().getFullYear();
  let pool = YEARS.filter((y) => !s.level || y[0] === s.level);
  if (pool.length < 8) pool = YEARS;
  return drawMany("years", pool, s.count).map(([lv, text, year]) => {
    const frac = [0, 0.3, 0.2, 0.12, 0.06][lv] ?? 0.15;
    const span = Math.max(3, Math.round((now - year) * frac));
    const yrs = new Set<number>([year]);
    let guard = 0;
    while (yrs.size < 4 && guard++ < 200) {
      const off = Math.max(1, Math.round(span * (0.35 + Math.random() * 0.65)));
      const y = year + (Math.random() < 0.5 ? -off : off);
      if (y > 0 && y <= now) yrs.add(y);
    }
    const options = shuffle([...yrs].map(String));
    return {
      prompt: `In which year: ${text}?`,
      options,
      correct: options.indexOf(String(year)),
      seconds: 20,
      points: lv,
      label: levelName(lv),
      explain: `${text} in ${year}.`,
    };
  });
}
