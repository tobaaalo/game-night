import type { HostQuestion } from "../shared/protocol";
import { AITEXT, BIBLE, FACES, PAIRS, TRIVIA, levelName, type QuizItem, type World } from "../content";
import { draw, drawMany, pick, shuffle } from "../lib/deck";

export type WorldMode = "flag" | "shape" | "cap" | "fact" | "slang" | "mix";

export interface QuizSetup {
  level: number;
  count: number;
  mode?: string;
  cats?: string[];
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

export function faceQuestions(s: QuizSetup): HostQuestion[] {
  const pool = FACES.filter((f) => !s.level || f.level === s.level);
  return drawMany("faces", pool, s.count).map((f) => {
    const same = shuffle(FACES.filter((x) => x.id !== f.id && x.level === f.level)).slice(0, 3);
    const options = shuffle([f.name, ...same.map((x) => x.name)]);
    return {
      prompt: "Who is this?",
      media: { type: "image", src: `/faces/${f.id}.jpg`, alt: "A famous face" },
      options,
      correct: options.indexOf(f.name),
      seconds: 15,
      points: Math.max(1, f.level),
      label: levelName(f.level),
      explain: `That's ${f.name}.`,
    };
  });
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
