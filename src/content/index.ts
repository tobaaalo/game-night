import bible from "./bible.json";
import trivia from "./trivia.json";
import couple from "./couple.json";
import knowme from "./knowme.json";
import wyr from "./wyr.json";
import likely from "./likely.json";
import hotseat from "./hotseat.json";
import twotruths from "./twotruths.json";
import charades from "./charades.json";
import taboo from "./taboo.json";
import proverbs from "./proverbs.json";
import aitext from "./aitext.json";
import emojiCats from "./emojiCats.json";
import emoji from "./emoji.json";
import n5Themes from "./n5Themes.json";
import name5 from "./name5.json";
import sports from "./sports.json";
import faces from "./faces.json";
import realai from "./realai.json";
import higherlower from "./higherlower.json";
import oddone from "./oddone.json";
import years from "./years.json";
import nhie from "./nhie.json";
import bingo from "./bingo.json";
import drawwords from "./drawwords.json";
import bucket from "./bucket.json";

export type Level = 1 | 2 | 3 | 4;
/** [level, question, [rightAnswer, ...wrong]] */
export type QuizItem = [number, string, string[], string?];
export type EmojiItem = [string, number, string, string];
export type Name5Item = [number, string, string];
export interface Face {
  id: string;
  name: string;
  level: number;
  w: number;
  h: number;
  src: string;
  cat: string;
  g: "m" | "f" | "x";
}
export interface Pair {
  id: string;
  name: string;
  src: string;
  aiTool: string;
}
export interface Country {
  c: string;
  n: string;
  cap: string;
  lv: number;
  shape: string | null;
}

export const BIBLE = bible as QuizItem[];
export const TRIVIA = trivia as QuizItem[];
export const COUPLE = couple as string[];
export const KNOWME = knowme as string[];
export const WYR = wyr as string[];
export const LIKELY = likely as string[];
export const HOTSEAT = hotseat as string[];
export const TWOTRUTHS = twotruths as string[];
export const CHARADES = charades as string[];
export const TABOO = taboo as string[][];
export const PROVERBS = proverbs as [string, string][];
export const AITEXT = aitext as [string, string, string, number][];
export const EMOJI_CATS = emojiCats as [string, string][];
export const EMOJI = emoji as EmojiItem[];
export const N5_THEMES = n5Themes as [string, string][];
export const NAME5 = name5 as Name5Item[];
export const FACES = faces as Face[];
export interface Athlete {
  id: string;
  name: string;
  level: number;
  w: number;
  h: number;
  g: "m" | "f" | "x";
  sports: string[];
  leagues: string[];
  eras: string[];
}
export const ATHLETES = sports as Athlete[];
export const SPORT_LIST: [string, string][] = [
  ["football", "Football"],
  ["basketball", "Basketball"],
  ["tennis", "Tennis"],
  ["athletics", "Athletics"],
  ["boxing", "Boxing"],
  ["mma", "MMA"],
  ["f1", "Formula 1"],
  ["cricket", "Cricket"],
  ["rugby", "Rugby"],
  ["golf", "Golf"],
  ["nfl", "NFL"],
  ["baseball", "Baseball"],
  ["hockey", "Hockey"],
  ["wrestling", "Wrestling"],
  ["swimming", "Swimming"],
  ["cycling", "Cycling"],
  ["gymnastics", "Gymnastics"],
  ["olympics", "Olympics"],
];
export const PAIRS = realai as Pair[];

export const FACE_CATS: [string, string][] = [
  ["General", "Science and business"],
  ["Screen", "Movies and TV"],
  ["Music", "Music"],
  ["Leaders", "Leaders and history"],
  ["Faith", "Faith and culture"],
];
export const FACE_CATS_DEFAULT = FACE_CATS.map((c) => c[0]).filter((c) => c !== "Leaders");

export const TRIVIA_CATS: [string, string][] = [
  ["General", "General knowledge"],
  ["Science", "Science and nature"],
  ["History", "History"],
  ["Geography", "Geography"],
  ["Sport", "Sport"],
  ["Music", "Music"],
  ["Screen", "Film and TV"],
  ["Arts", "Books and art"],
  ["Animals", "Animals"],
  ["Myth", "Mythology"],
  ["Tech", "Tech and games"],
  ["Maths", "Maths"],
  ["Vehicles", "Cars and vehicles"],
];

export const LEVELS: { value: number; label: string }[] = [
  { value: 1, label: "Easy" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Hard" },
  { value: 4, label: "Extremely hard" },
  { value: 0, label: "Mixed" },
];
export const levelName = (n: number) => ["Mixed", "Easy", "Medium", "Hard", "Extremely hard"][n] ?? "";

/** World Decoder data is big (country outlines), so it loads only when needed. */
export async function loadWorld() {
  const [countries, facts, slang] = await Promise.all([
    import("./countries.json"),
    import("./wdFacts.json"),
    import("./wdSlang.json"),
  ]);
  return {
    countries: countries.default as Country[],
    facts: facts.default as Record<string, string>,
    slang: slang.default as unknown as Record<string, [string, string][]>,
  };
}
export type World = Awaited<ReturnType<typeof loadWorld>>;

export const HOLDATA = higherlower as unknown as Record<string, [string, number][]>;
/** [level, four options, odd one, reason] */
export const ODDONE = oddone as [number, string[], string, string][];
/** [level, event, year] */
export const YEARS = years as [number, string, number][];
export const NHIE = nhie as string[];
export const BINGO = [...(charades as string[]), ...(bingo as string[])];
/** [level, word] */
export const DRAWWORDS = drawwords as [number, string][];
/** [category, idea] */
export const BUCKET = bucket as [string, string][];
