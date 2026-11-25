import type { Player } from "./app";

export const BOT_NAME = "Computer";
export type Skill = 1 | 2 | 3;
export const SKILLS: { value: Skill; label: string; rule: string }[] = [
  { value: 1, label: "Easy", rule: "Gets about 4 in 10 right. Forgets a lot." },
  { value: 2, label: "Medium", rule: "Gets about 7 in 10 right." },
  { value: 3, label: "Hard", rule: "Gets about 9 in 10 right. Hard to beat." },
];

/** How each game treats the computer. "play" = takes real turns. "solo" = sits out, you play the cards. "people" = needs other humans. */
export type BotMode = "play" | "solo" | "people";
const MODE: Record<string, BotMode> = {
  nhie: "solo",
  hangman: "solo",
  wordguess: "solo",
  spy: "people",
  wyr: "solo",
  knowme: "people",
  likely: "people",
  twotruths: "people",
  hotseat: "people",
  couple: "people",
  bucket: "people",
  emoji: "people",
  proverbs: "people",
  clues: "people",
  charades: "people",
  taboo: "people",
  name5: "people",
  bingo: "people",
  draw: "people",
  npat: "people",
};
/** Games that are shouted, acted or drawn out loud, so a computer can't take part. */
export const SPOKEN = new Set(["emoji", "proverbs", "clues", "charades", "taboo", "name5", "bingo", "draw", "npat"]);
export const botMode = (id: string): BotMode => MODE[id] ?? "play";
/** Games where the computer cannot join in: how many people they need. */
export const NEEDS: Record<string, number> = {
  spy: 3,
  knowme: 2,
  likely: 3,
  twotruths: 2,
  hotseat: 2,
  couple: 2,
  bucket: 2,
  emoji: 2,
  proverbs: 2,
  clues: 2,
  charades: 2,
  taboo: 2,
  name5: 2,
  bingo: 2,
  draw: 2,
  npat: 2,
};

export const hasBot = (ps: Player[]) => ps.some((p) => p.bot);
export const botOf = (ps: Player[]) => ps.find((p) => p.bot);
export const humans = (ps: Player[]) => ps.filter((p) => !p.bot);

const RIGHT = [0.4, 0.7, 0.9] as const;
const FIRST = [0.3, 0.5, 0.72] as const;
const REMEMBER = [0.3, 0.65, 0.95] as const;
const WORDS = [0.65, 0.85, 0.97] as const;

/** Does the computer get a question worth `points` right? Harder questions are harder for it too. */
export const botRight = (skill: Skill = 2, points = 1) =>
  Math.random() < Math.max(0.15, RIGHT[skill - 1] - Math.min(0.2, (points - 1) * 0.05));
/** Does the computer beat the humans to the answer in a shouting race? */
export const botFirst = (skill: Skill = 2) => Math.random() < FIRST[skill - 1];
/** Chance it remembers a card it saw in Memory Match. */
export const botRemembers = (skill: Skill = 2) => Math.random() < REMEMBER[skill - 1];
/** Chance it finds a word in time in Word Chain. */
export const botFindsWord = (skill: Skill = 2) => Math.random() < WORDS[skill - 1];
/** Words per minute-ish for acting games: how many it gets through in `seconds`. */
export const botCount = (skill: Skill = 2, seconds = 60) => {
  const base = [3, 5, 8][skill - 1] * (seconds / 60);
  return Math.max(0, Math.round(base + (Math.random() * 2 - 1)));
};
export const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const BOT_DELAY = 1100;
