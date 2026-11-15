import type { HostQuestion } from "../shared/protocol";
import { AITEXT, ATHLETES, BIBLE, FACES, PAIRS, TRIVIA, levelName, type QuizItem, type World } from "../content";
import { draw, drawMany, pick, shuffle } from "../lib/deck";

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

/** Wrong answers that can't be ruled out: same gender, same field, similar fame. */
export function lookalikes<T extends Person>(
  f: T,
  all: T[],
  group: (x: T) => string,
  n = 3,
  used: Set<string> = new Set(),
): T[] {
  const fresh = all.filter((x) => x.id !== f.id && !used.has(x.name));
  const rest = fresh.length >= n * 4 ? fresh : all.filter((x) => x.id !== f.id);
  const sex = rest.filter((x) => x.g === f.g || x.g === "x" || f.g === "x");
  const near = (x: T) => Math.abs(x.level - f.level) <= 1;
  const tiers = [
    sex.filter((x) => group(x) === group(f) && near(x)),
    sex.filter((x) => group(x) === group(f)),
    sex.filter(near),
    sex,
  ];
  const out: T[] = [];
  for (const t of tiers) for (const x of shuffle(t)) if (out.length < n && !out.includes(x)) out.push(x);
  return out;
}

function personQuestion<T extends Person>(
  f: T,
  all: T[],
  group: (x: T) => string,
  alt: string,
  used: Set<string>,
): HostQuestion {
  const same = lookalikes(f, all, group, 3, used);
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
  const picked = drawMany("faces", facePool(s.level, s.cats), s.count);
  const used = new Set(picked.map((f) => f.name));
  return picked.map((f) => personQuestion(f, FACES, (x) => x.cat, "A famous face", used));
}

export function athleteQuestions(s: QuizSetup): HostQuestion[] {
  const picked = drawMany("sports", athletePool(s.level, s.cats, s.eras), s.count);
  const used = new Set(picked.map((f) => f.name));
  return picked.map((f) => personQuestion(f, ATHLETES, (x) => x.sports[0], "A sports star", used));
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

export function worldQuestions(w: World, s: QuizSetup): HostQuestion[] {
  const mode = (s.mode ?? "flag") as WorldMode;
  const okFor = (c: World["countries"][number], m: WorldMode) =>
    m === "shape" ? !!c.shape : m === "fact" ? !!w.facts[c.c] : m === "slang" ? !!w.slang[c.c] : true;
  let base = w.countries.filter((c) => (!s.level || c.lv === s.level) && (mode === "mix" || okFor(c, mode)));
  if (mode === "slang" && base.length < s.count) base = w.countries.filter((c) => okFor(c, "slang"));
  return drawMany(`world|${mode}`, base, s.count).map((k) => {
    let m: WorldMode = mode;
    if (m === "mix") m = pick((["flag", "shape", "cap", "fact", "slang"] as WorldMode[]).filter((x) => okFor(k, x)));
    const cands = w.countries.filter((c) => c !== k && (m !== "slang" || w.slang[c.c]));
    const same = shuffle(cands.filter((c) => c.lv === k.lv));
    const other = shuffle(cands.filter((c) => c.lv !== k.lv));
    const options = shuffle([k, ...same.slice(0, 3), ...other].slice(0, 4)).map((c) => c.n);
    const sl = w.slang[k.c] ? pick(w.slang[k.c]) : null;
    const base = {
      options,
      correct: options.indexOf(k.n),
      seconds: 20,
      points: Math.max(1, k.lv),
      label: levelName(k.lv),
    };
    const fact = w.facts[k.c];
    const tail = `Capital: ${k.cap}.`;
    switch (m) {
      case "shape":
        return {
          ...base,
          prompt: "Which country has this shape?",
          media: { type: "shape", d: k.shape ?? "" },
          explain: `It's ${k.n}. ${tail}`,
        };
      case "cap":
        return {
          ...base,
          prompt: "Which country has this capital city?",
          media: { type: "big", text: k.cap },
          explain: `It's ${k.n}. ${fact ?? ""}`,
        };
      case "fact":
        return {
          ...base,
          prompt: "Which country is this?",
          media: { type: "big", text: fact ?? "" },
          explain: `It's ${k.n}. ${tail}`,
        };
      case "slang":
        return {
          ...base,
          prompt: "Where would you hear people say this?",
          media: { type: "big", text: `“${sl?.[0] ?? ""}”` },
          explain: `It's ${k.n}. “${sl?.[0]}” means ${sl?.[1]}.`,
        };
      default:
        return {
          ...base,
          prompt: "Which country's flag is this?",
          media: { type: "flag", code: k.c },
          explain: `It's ${k.n}. ${tail} ${fact ?? ""}`,
        };
    }
  });
}

/** Quick check used by tests and the library: pools per level. */
export const countBy = (bank: QuizItem[], level: number) => bank.filter((q) => !level || q[0] === level).length;
export { draw };
