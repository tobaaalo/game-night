import { useState } from "react";
import { load, save } from "./store";
import { shuffle } from "./deck";
import type { GameDef } from "../games/registry";
import { QuizRun } from "../games/quiz";
import { CardDeck, RevealRun, TimedRun } from "../games/party";

export type CustomType = "cards" | "quiz" | "reveal" | "timed";
export interface CustomGame {
  id: string;
  name: string;
  type: CustomType;
  lines: string;
  updated: number;
}

export const CUSTOM_TYPES: Record<CustomType, { label: string; help: string; example: string }> = {
  cards: {
    label: "Question cards",
    help: "One question per line. They're read out loud, no scoring.",
    example: "What's your favourite memory from our wedding?\nWho cried first on the day?\nWhat song did we dance to first?",
  },
  quiz: {
    label: "Quiz with answers",
    help: "Question | right answer | wrong answer | wrong answer. The right answer always goes first; the app shuffles them.",
    example: "Where did we first meet? | Church | Work | University | A party\nWhat year did we get married? | 2022 | 2021 | 2023 | 2020",
  },
  reveal: {
    label: "Guess the answer",
    help: "Question | answer. Players shout, you reveal and tap who got it.",
    example: "Mummy's favourite dish | Egusi soup\nThe city where we honeymooned | Marrakech",
  },
  timed: {
    label: "Act it out",
    help: "One word or phrase per line. Act or describe as many as you can in 60 seconds.",
    example: "Our first date\nAssembling flat-pack furniture\nWaiting at the airport",
  },
};

export const loadCustom = () => load<CustomGame[]>("gn.custom", []);
export const saveCustom = (g: CustomGame[]) => save("gn.custom", g);

export const parseLines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** Returns a problem description for the first malformed line, or null if the game is valid. */
export function validate(type: CustomType, lines: string[]): string | null {
  if (lines.length < 2) return "Add at least two lines.";
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split("|").map((x) => x.trim()).filter(Boolean);
    if (type === "quiz" && parts.length < 3) return `Line ${i + 1} needs a question, the right answer and at least one wrong answer, separated by |.`;
    if (type === "reveal" && parts.length < 2) return `Line ${i + 1} needs a question and an answer, separated by |.`;
  }
  return null;
}

function Again({ children }: { children: (again: () => void, k: number) => React.ReactNode }) {
  const [k, setK] = useState(0);
  return <>{children(() => setK((x) => x + 1), k)}</>;
}

export function customToGame(c: CustomGame): GameDef {
  const lines = parseLines(c.lines);
  const t = CUSTOM_TYPES[c.type];
  const base = {
    id: `custom-${c.id}`,
    name: c.name,
    blurb: t.label,
    how: t.help,
    section: "yours" as const,
    groups: ["couple", "friends"] as GameDef["groups"],
    stat: `${lines.length} lines`,
  };
  if (c.type === "quiz")
    return {
      ...base,
      Play: () => (
        <Again>
          {(again, k) => (
            <QuizRun
              key={k}
              onAgain={again}
              questions={shuffle(lines).map((l) => {
                const [q, right, ...wrong] = l.split("|").map((x) => x.trim()).filter(Boolean);
                const options = shuffle([right, ...wrong].slice(0, 4));
                return { prompt: q, options, correct: options.indexOf(right), seconds: 20, points: 1, explain: `The answer is ${right}.` };
              })}
            />
          )}
        </Again>
      ),
    };
  if (c.type === "reveal")
    return {
      ...base,
      Play: () => (
        <Again>
          {(again, k) => (
            <RevealRun
              key={k}
              onAgain={again}
              items={shuffle(lines).map((l) => {
                const [q, a] = l.split("|").map((x) => x.trim());
                return { prompt: q, answer: a ?? "", points: 1 };
              })}
            />
          )}
        </Again>
      ),
    };
  if (c.type === "timed")
    return { ...base, Play: () => <TimedRun id={base.id} items={lines} seconds={60} intro="Act or describe each one. Everyone else guesses." render={(w) => <p>{w}</p>} /> };
  return { ...base, scores: false, Play: () => <CardDeck id={base.id} items={lines} /> };
}
