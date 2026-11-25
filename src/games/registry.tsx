import { useEffect, useState, type ReactNode } from "react";
import type { HostQuestion } from "../shared/protocol";
import { TEAM_OPTIONS } from "../shared/team";
import {
  BINGO,
  BUCKET,
  CHARADES,
  COUPLE,
  EMOJI,
  EMOJI_CATS,
  ATHLETES,
  FACE_CATS,
  SPORT_LIST,
  FACE_CATS_DEFAULT,
  HOTSEAT,
  NHIE,
  KNOWME,
  LEVELS,
  LIKELY,
  N5_THEMES,
  TRIVIA_CATS,
  NAME5,
  PAIRS,
  PROVERBS,
  TABOO,
  TWOTRUTHS,
  WYR,
  levelName,
  loadWorld,
} from "../content";
import { useApp, type Group } from "../lib/app";
import { draw, drawFresh, drawMany, shuffle } from "../lib/deck";
import {
  bibleQuestions,
  faceQuestions,
  facePool,
  realAiQuestions,
  triviaQuestions,
  worldQuestions,
  athletePool,
  athleteQuestions,
  higherLowerQuestions,
  oddOneQuestions,
  yearQuestions,
} from "./generators";
import { QuizRun, Setup, type Field, type SetupValues } from "./quiz";
import { CardDeck, KnowMe, NPAT, RevealRun, TimedRun, type RevealItem } from "./party";
import { ClueRun } from "./clues";
import { DuelLocal } from "./duel";
import { Hangman, Spy, WordGuess } from "./wordgames";
import type { DuelGame } from "../shared/duel";
import { WordLadder, BucketList, CharadesBingo, DrawGuess, MemoryMatch, WordChain } from "./extra";
import { CLUES, DRAWWORDS, LADDER } from "../content";
import type { LiveCfg } from "../shared/live";
import { emojiPool } from "./emojisets";
import { STARTS } from "./extra";
import { loadCustom, customToGame } from "../lib/custom";
import { HOW } from "./how";
import { GAME_NAMES } from "../shared/duel";

export type Section = "pictures" | "quiz" | "words" | "duel" | "talk" | "party" | "yours";
export const SECTIONS: Record<Section, { title: string; blurb: string }> = {
  pictures: { title: "Picture rounds", blurb: "Faces, flags and fakes" },
  quiz: { title: "Quiz show", blurb: "Four options, one right answer" },
  words: { title: "Word games", blurb: "Letters, guesses and puzzles" },
  duel: { title: "Head to head", blurb: "Two players, one board" },
  talk: { title: "Talk & tell", blurb: "Questions that get people talking" },
  party: { title: "On the clock", blurb: "Timers, acting and shouting" },
  yours: { title: "Your own games", blurb: "Made on this phone" },
};

export interface GameDef {
  id: string;
  name: string;
  blurb: string;
  how: string;
  section: Section;
  groups: Group[];
  minPlayers?: number;
  /** Most players the game can take. Above this it is hidden, on one phone and in a room. */
  maxPlayers?: number;
  room?: boolean;
  scores?: boolean;
  stat: string;
  /** Rendered inside GameFrame */
  Play: () => ReactNode;
  /** For room mode: setup fields + question builder */
  roomFields?: Field[];
  /** Team games: build the puzzles and the room starts one shared board instead of asking questions. */
  teamBuild?: (v: SetupValues) => [number, string, string, number][];
  roomName?: string;
  roomBlurb?: string;
  buildQuestions?: (v: SetupValues, names: string[]) => Promise<HostQuestion[]>;
  /** Live games: one shared board the server runs (acting, drawing, typing together). */
  liveBuild?: (v: SetupValues, names: string[]) => LiveCfg | Promise<LiveCfg>;
}

const levelField = (def = 1, rules?: Record<number, string>): Field => ({
  key: "level",
  legend: "Level",
  options: LEVELS.map((l) => ({ value: l.value, label: l.label, rule: rules?.[l.value] })),
  def,
});
const RULES = {
  bible: {
    1: "Well-known people and events, finishing famous verses, and the main books.",
    2: "Which book a verse is in, who wrote what, and what comes next in the Bible.",
    3: "Specific details, lesser characters, and verses from the less-read books.",
    4: "Very difficult. Spot the book of a verse from the minor prophets and the letters, and exact facts.",
    0: "A mix of all four levels.",
  },
  trivia: {
    1: "Everyday facts a child would know.",
    2: "School-level general knowledge.",
    3: "Needs some real learning: history, science, geography.",
    4: "Specialist or surprising facts that trip up most adults.",
    0: "A mix of all four levels.",
  },
  sports: {
    1: "The biggest names in world sport.",
    2: "Stars most sports fans can place.",
    3: "Famous in their sport or country, less so elsewhere.",
    4: "Legends and cult heroes that only real fans place from a photo.",
    0: "A mix of all four levels.",
  },
  faces: {
    1: "Global household names, among the most viewed people on Wikipedia.",
    2: "Very well known, but you may need a second to place them.",
    3: "Famous in their field or country, less so abroad.",
    4: "Respected names that few people place from a photo alone.",
    0: "A mix of all four levels.",
  },
  name5: {
    1: "Broad categories with loads of possible answers.",
    2: "Themed categories with plenty of answers.",
    3: "Narrower categories: you'll need to dig.",
    4: "Specific categories where five answers is a real stretch.",
    0: "A mix of all four levels.",
  },
  emoji: {
    1: "Famous films, foods and phrases with obvious emoji.",
    2: "Common answers with a clever twist in the emoji.",
    3: "Trickier clues: needs lateral thinking.",
    4: "Obscure answers with abstract emoji clues.",
    0: "A mix of all four levels.",
  },
};
const countField = (
  def = 10,
  opts = [5, 10, 15, 20],
  key = "count",
  legend = "How many",
  unit = "in total",
): Field => ({
  key,
  legend,
  options: opts.map((n) => ({ value: n, label: String(n) })),
  def,
  // "count" fields are always a multiple of the number of players; ladders are shared between teams, so any number works.
  custom: { min: 1, max: key === "count" ? 60 : 30, multiple: key === "count", unit },
});
/** Word Ladder rounds. A different key from "count", so the number is never rounded up to match the players. */
const laddersField = countField(4, [2, 3, 4, 5, 6], "rounds", "How many ladders", "ladders");

/** Wraps a setup → play cycle for games that build a list up front. */
function SetupThen<T>({
  id,
  fields,
  build,
  run,
  note,
}: {
  id: string;
  fields: Field[];
  build: (v: SetupValues) => Promise<T> | T;
  run: (data: T, again: () => void) => ReactNode;
  note?: string;
}) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (data) return <>{run(data, () => setData(null))}</>;
  return (
    <>
      {busy && <p className="hint center-text">Shuffling the deck…</p>}
      <Setup
        id={id}
        fields={fields}
        note={note}
        error={err}
        onStart={async (v) => {
          setBusy(true);
          setErr(undefined);
          try {
            const d = await build(v);
            if (Array.isArray(d) && d.length === 0)
              setErr("Nothing matches that mix yet. Try another level or more categories.");
            else setData(d);
          } catch {
            setErr("Couldn't load this game. Check your connection and try again.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

/** Card decks: pick how many cards, then each person gets the same number of goes. */
const deckPlay = (id: string, items: string[], format?: (s: string) => string) => () => (
  <SetupThen
    id={id}
    fields={[countField(10, [10, 20, 30], "count", "How many cards", "cards in total")]}
    build={(v) => ({ total: num(v.count) })}
    run={(d, again) => <CardDeck id={id} items={items} format={format} total={d.total} onAgain={again} />}
  />
);

/** Room version of a talking game: everyone answers on their own phone, results show how the room voted. No points. */
const pollRoom =
  (
    id: string,
    items: string[],
    make: (x: string, names: string[]) => Pick<HostQuestion, "prompt" | "options"> & Partial<HostQuestion>,
  ) =>
  async (v: SetupValues, names: string[]): Promise<HostQuestion[]> =>
    drawMany(id, items, num(v.count) || 10).map((x) => ({ correct: -1, seconds: 30, points: 0, ...make(x, names) }));
const talkFields: Field[] = [countField(10, [5, 10, 15, 20], "count", "How many cards", "cards in total")];

const quizPlay =
  (id: string, fields: Field[], build: (v: SetupValues) => Promise<HostQuestion[]>, note?: string) => () => (
    <SetupThen
      id={id}
      fields={fields}
      build={build}
      note={note}
      run={(qs, again) => <QuizRun questions={qs} onAgain={again} />}
    />
  );

const WORLD_MODES = [
  { value: "flag", label: "Flags" },
  { value: "shape", label: "Country shapes" },
  { value: "cap", label: "Capital cities" },
  { value: "fact", label: "Famous facts" },
  { value: "slang", label: "Local slang" },
  { value: "mix", label: "Mix of everything" },
];

const bibleFields = [levelField(1, RULES.bible), countField()];
const triviaFields = [
  {
    key: "cats",
    legend: "Topics",
    multi: true,
    options: TRIVIA_CATS.map(([value, label]) => ({ value, label })),
    def: TRIVIA_CATS.map((c) => c[0]),
  } as Field,
  levelField(1, RULES.trivia),
  countField(),
];
const worldFields: Field[] = [
  { key: "mode", legend: "What to decode", options: WORLD_MODES, def: "flag" },
  levelField(),
  countField(),
];
const faceFields: Field[] = [
  {
    key: "cats",
    legend: "Who to include",
    multi: true,
    options: FACE_CATS.map(([value, label]) => ({ value, label })),
    def: FACE_CATS_DEFAULT,
  },
  levelField(1, RULES.faces),
  countField(),
];
const sportFields: Field[] = [
  {
    key: "cats",
    legend: "Which sports",
    multi: true,
    options: SPORT_LIST.filter(([v]) => ATHLETES.some((a) => a.sports.includes(v))).map(([value, label]) => ({
      value,
      label,
    })),
    def: SPORT_LIST.filter(([v]) => ATHLETES.some((a) => a.sports.includes(v))).map(([v]) => v),
  },
  {
    key: "eras",
    legend: "Era",
    multi: true,
    options: [
      ["90s", "Before 2000"],
      ["00s", "2000s"],
      ["10s", "2010s"],
      ["now", "Now"],
    ].map(([value, label]) => ({ value, label })),
    def: ["90s", "00s", "10s", "now"],
  },
  levelField(1, RULES.sports),
  countField(),
];
const sportSetup = (v: SetupValues) => ({
  level: num(v.level),
  count: num(v.count),
  cats: v.cats as string[],
  eras: v.eras as string[],
});
const realFields: Field[] = [
  {
    key: "mode",
    legend: "Round",
    options: [
      { value: "pic", label: "Pictures" },
      { value: "text", label: "Texts" },
    ],
    def: "pic",
  },
  {
    key: "level",
    legend: "Text difficulty",
    showIf: { key: "mode", value: "text" },
    options: [
      { value: 1, label: "Easy", rule: "The AI text sounds like a typical AI." },
      { value: 2, label: "Hard", rule: "Both are casual and written in the same voice." },
      {
        value: 3,
        label: "Extremely hard",
        rule: "Both are polished and thoughtful. Only small habits give the AI away.",
      },
      { value: 0, label: "Mixed" },
    ],
    def: 2,
  },
  countField(PAIRS.length >= 10 ? 10 : 5),
];

const num = (v: unknown) => Number(v);

const timeField = (key: string, legend: string, opts: [number, string][], def: number): Field => ({
  key,
  legend,
  options: opts.map(([value, label]) => ({ value, label })),
  def,
});
const LADDER_RULES = {
  1: "Three-letter words and short ladders.",
  2: "Four-letter words, about five moves.",
  3: "Longer ladders, seven to nine moves.",
  4: "Very long ladders of ten or more moves. Only for word wizards.",
  0: "A mix of all four levels.",
};
const matchFields: Field[] = [
  {
    key: "theme",
    legend: "Match a picture to its name",
    options: [
      { value: "faces", label: "Famous faces" },
      { value: "sports", label: "Sports stars" },
      { value: "flags", label: "Flags" },
      { value: "emoji", label: "Emoji" },
    ],
    def: "flags",
  },
  timeField(
    "pairs",
    "How many pairs",
    [
      [6, "6"],
      [8, "8"],
      [10, "10"],
      [12, "12"],
    ],
    6,
  ),
  levelField(1, RULES.faces),
];
async function matchPairs(v: SetupValues): Promise<[string, string | undefined, string][]> {
  const n = num(v.pairs);
  const lv = num(v.level);
  switch (v.theme) {
    case "faces":
      return drawMany("match-faces", facePool(lv), n).map((f) => [f.name, `/faces/${f.id}.jpg`, f.name]);
    case "sports":
      return drawMany("match-sports", athletePool(lv), n).map((f) => [f.name, `/faces/${f.id}.jpg`, f.name]);
    case "flags": {
      const w = await loadWorld();
      const pool = w.countries.filter((c) => !lv || c.lv === lv);
      return drawMany("match-flags", pool.length >= n ? pool : w.countries, n).map((c) => [
        c.n,
        `/flags/${c.c}.svg`,
        c.n,
      ]);
    }
    default:
      return drawMany("match-emoji", emojiPool("mixed"), n).map(([e, t]) => [e, undefined, t]);
  }
}

const simpleFields = (rules: Record<number, string>): Field[] => [levelField(1, rules), countField()];
const quizSetup = (v: SetupValues) => ({ level: num(v.level), count: num(v.count) });
const HOL_RULES = {
  1: "The two numbers are miles apart, so it's an easy call.",
  2: "One is at least double the other.",
  3: "They are fairly close. Trust your gut.",
  4: "Nearly neck and neck. Only a real know-it-all gets these.",
  0: "A mix of all four levels.",
};
const ODD_RULES = {
  1: "The odd one comes from a completely different world. Obvious to a child.",
  2: "Needs a little general knowledge, or the groups are easy to mix up.",
  3: "Close cousins: the odd one comes from a very similar list, like two kinds of rock.",
  4: "Experts only: rare names, and the odd one is a near neighbour of the rest.",
  0: "A mix of all four levels.",
};
const YEAR_RULES = {
  1: "Huge events and the wrong years are far apart.",
  2: "Well-known events. The options are a decade or so apart.",
  3: "Historic moments. The options are only a few years apart.",
  4: "Older history. The options are close together.",
  0: "A mix of all four levels.",
};

const emojiFields: Field[] = [
  {
    key: "cats",
    legend: "Categories",
    options: EMOJI_CATS.map(([value, label]) => ({ value, label })),
    def: EMOJI_CATS.map((c) => c[0]),
    multi: true,
  },
  levelField(0, RULES.emoji),
  countField(),
];

/** Turns for the timed party games: each player gets the same number. */
const turnFields: Field[] = [countField(6, [2, 4, 6, 10], "count", "How many turns", "turns in total")];

const tabooFields: Field[] = [
  {
    key: "nb",
    legend: "Banned words per card",
    options: [
      { value: 2, label: "Easy, 2" },
      { value: 4, label: "Medium, 4" },
      { value: 6, label: "Hard, 6" },
      { value: 8, label: "Extreme, 8" },
    ],
    def: 4,
  },
  ...turnFields,
];

const name5Fields: Field[] = [
  {
    key: "th",
    legend: "Themes",
    options: N5_THEMES.map(([value, label]) => ({ value, label })),
    def: N5_THEMES.map((t) => t[0]),
    multi: true,
  },
  levelField(1, RULES.name5),
  countField(10, [5, 10, 15, 20], "count", "How many turns"),
  {
    key: "s",
    legend: "Seconds on the clock",
    options: [10, 15, 20].map((n) => ({ value: n, label: `${n}s` })),
    def: 10,
  },
];

const name5RoomFields: Field[] = [
  ...name5Fields.slice(0, 3),
  {
    key: "how",
    legend: "How to answer",
    options: [
      { value: "shout", label: "Shout it out" },
      { value: "type", label: "Type it" },
    ],
    def: "shout",
  },
  {
    key: "s",
    legend: "Seconds on the clock",
    options: [10, 15, 20, 30, 45, 60].map((n) => ({ value: n, label: `${n}s` })),
    def: 10,
  },
];

const CLUE_FAMILY: Record<string, string> = {
  person: "p",
  character: "p",
  country: "c",
  place: "l",
  animal: "a",
  food: "f",
  thing: "t",
  film: "t",
};
const CLUE_RULES: Record<number, string> = {
  1: "Famous people, places, animals and things almost everyone knows.",
  2: "Well known, but you will have to think.",
  3: "Harder names from history, science, art and the wider world.",
  4: "Very hard. Only the sharpest guessers get these.",
  0: "A mix of all four levels.",
};
const clueFields: Field[] = [levelField(1, CLUE_RULES), countField(5)];
const PROVERB_RULES: Record<number, string> = {
  1: "Sayings everyone knows.",
  2: "Familiar, but you may have to think.",
  3: "Older and less common sayings.",
  4: "Rare sayings, Bible verses and deeper African proverbs.",
  0: "A mix of all four levels.",
};
const proverbFields: Field[] = [levelField(1, PROVERB_RULES), countField(10)];
const proverbPool = (v: SetupValues) => PROVERBS.filter((p) => !num(v.level) || p[0] === num(v.level));
const cluePool = (v: SetupValues) => CLUES.filter((c) => !num(v.level) || c[0] === num(v.level));

/** How many games make a match. Rock Paper Scissors is a single throw, so its matches are longer. */
const bestField = (def: number, opts: number[]): Field => ({
  key: "best",
  legend: "How long",
  options: opts.map((n) => ({ value: n, label: n === 1 ? "One game" : `Best of ${n}` })),
  def,
});

/** Head to head games are for two. On one phone they need two players or the computer; some need the computer or a room. */
function DuelPlay({ game, def, opts, hidden }: { game: DuelGame; def: number; opts: number[]; hidden?: boolean }) {
  const { players, go } = useApp();
  const bot = players.some((p) => p.bot);
  if (hidden && !bot)
    return (
      <div className="stack center-text">
        <p className="h3">{GAME_NAMES[game]} has secrets</p>
        <p className="lede">
          Each player keeps something hidden, so it needs two phones or the computer. Start a room with a friend, or
          play against the computer.
        </p>
        <div className="actions center">
          <button className="btn" onClick={() => go("/who")}>
            Play the computer
          </button>
        </div>
      </div>
    );
  return (
    <SetupThen
      id={game}
      fields={[bestField(def, opts)]}
      build={(v) => num(v.best) || def}
      run={(best, again) => <DuelLocal game={game} best={best} onAgain={again} />}
    />
  );
}
const DUEL_ROOM = (def: number, opts: number[]) => [bestField(def, opts)];

export const GAMES: GameDef[] = [
  {
    id: "faces",
    name: "Famous Faces",
    blurb: "Who's this? Leaders, actors, singers and thinkers.",
    how: HOW.faces,
    section: "pictures",
    groups: ["couple", "friends"],
    room: true,
    stat: "Photo quiz",
    Play: () => (
      <SetupThen
        id="faces"
        fields={[
          {
            key: "mode",
            legend: "How to play",
            options: [
              { value: "shout", label: "Shout it out" },
              { value: "pick", label: "Pick from four" },
            ],
            def: "shout",
          },
          ...faceFields,
        ]}
        build={(v) => ({
          mode: v.mode as string,
          qs:
            v.mode === "pick"
              ? faceQuestions({ level: num(v.level), count: num(v.count), cats: v.cats as string[] })
              : [],
          level: num(v.level),
          count: num(v.count),
          cats: v.cats as string[],
        })}
        run={(d, again) =>
          d.mode === "pick" ? (
            <QuizRun questions={d.qs} onAgain={again} />
          ) : (
            <RevealRun
              onAgain={again}
              items={drawMany("faces", facePool(d.level, d.cats), d.count).map<RevealItem>((f) => ({
                prompt: "Who is this?",
                answer: f.name,
                points: Math.max(1, f.level),
                label: levelName(f.level),
                image: { src: `/faces/${f.id}.jpg`, alt: "A famous face" },
                hint: f.name
                  .split(/\s+/)
                  .map((w) => w[0] + ".")
                  .join(" "),
              }))}
            />
          )
        }
      />
    ),
    roomFields: faceFields,
    buildQuestions: async (v) => faceQuestions({ level: num(v.level), count: num(v.count), cats: v.cats as string[] }),
  },
  {
    id: "sports",
    name: "Sports Stars",
    blurb: "Name the footballer, boxer, sprinter or driver.",
    how: HOW.sports,
    section: "pictures",
    groups: ["couple", "friends"],
    room: true,
    stat: "Sports photos",
    Play: () => (
      <SetupThen
        id="sports"
        fields={[
          {
            key: "mode",
            legend: "How to play",
            options: [
              { value: "shout", label: "Shout it out" },
              { value: "pick", label: "Pick from four" },
            ],
            def: "shout",
          },
          ...sportFields,
        ]}
        build={(v) => ({
          mode: v.mode as string,
          qs: v.mode === "pick" ? athleteQuestions(sportSetup(v)) : [],
          ...sportSetup(v),
        })}
        run={(d, again) =>
          d.mode === "pick" ? (
            <QuizRun questions={d.qs} onAgain={again} />
          ) : (
            <RevealRun
              onAgain={again}
              items={drawMany("sports", athletePool(d.level, d.cats, d.eras), d.count).map<RevealItem>((f) => ({
                prompt: "Who is this?",
                answer: f.name,
                points: Math.max(1, f.level),
                label: levelName(f.level),
                image: { src: `/faces/${f.id}.jpg`, alt: "A sports star" },
                hint: f.name
                  .split(/\s+/)
                  .map((w) => w[0] + ".")
                  .join(" "),
              }))}
            />
          )
        }
      />
    ),
    roomFields: sportFields,
    buildQuestions: async (v) => athleteQuestions(sportSetup(v)),
  },
  {
    id: "realai",
    name: "Real or AI?",
    blurb: "Two pictures. One is fake. Can you tell?",
    how: HOW.realai,
    section: "pictures",
    groups: ["couple", "friends"],
    room: true,
    stat: "Spot the fake",
    Play: quizPlay("realai", realFields, async (v) =>
      realAiQuestions({ level: num(v.level), count: num(v.count), mode: v.mode as string }),
    ),
    roomFields: realFields,
    buildQuestions: async (v) => realAiQuestions({ level: num(v.level), count: num(v.count), mode: v.mode as string }),
  },
  {
    id: "world",
    name: "World Decoder",
    blurb: "Flags, shapes, capitals, facts and slang.",
    how: HOW.world,
    section: "pictures",
    groups: ["couple", "friends"],
    room: true,
    stat: "Six ways to play",
    Play: quizPlay("world", worldFields, async (v) =>
      worldQuestions(await loadWorld(), { level: num(v.level), count: num(v.count), mode: v.mode as string }),
    ),
    roomFields: worldFields,
    buildQuestions: async (v) =>
      worldQuestions(await loadWorld(), { level: num(v.level), count: num(v.count), mode: v.mode as string }),
  },
  {
    id: "emoji",
    name: "Emoji Decode",
    blurb: "Films, Bible stories, sayings and more, in emoji.",
    how: HOW.emoji,
    section: "pictures",
    groups: ["couple", "friends"],
    stat: "Guess from emojis",
    room: true,
    roomFields: emojiFields,
    buildQuestions: async (v) => {
      const cats = v.cats as string[];
      const pool = EMOJI.filter((e) => cats.includes(e[0]) && (!num(v.level) || e[1] === num(v.level)));
      return drawMany("emoji", pool, num(v.count)).map<HostQuestion>(([cat, lv, q, a]) => {
        // Wrong answers come from the same category, so the category never gives the answer away.
        const wrong = shuffle(EMOJI.filter((e) => e[0] === cat && e[3] !== a))
          .slice(0, 3)
          .map((e) => e[3]);
        const options = shuffle([a, ...wrong]);
        return {
          prompt: "What do these emojis mean?",
          media: { type: "big", text: q, sub: EMOJI_CATS.find((c) => c[0] === cat)?.[1] ?? "" },
          options,
          correct: options.indexOf(a),
          seconds: 20,
          points: lv,
          label: levelName(lv),
        };
      });
    },
    Play: () => (
      <SetupThen
        id="emoji"
        fields={emojiFields}
        build={(v) => {
          const cats = v.cats as string[];
          const pool = EMOJI.filter((e) => cats.includes(e[0]) && (!num(v.level) || e[1] === num(v.level)));
          return drawMany("emoji", pool, num(v.count)).map<RevealItem>(([cat, lv, q, a]) => ({
            prompt: q,
            answer: a,
            points: lv,
            big: true,
            hint: `${a.trim().split(/\s+/).length} word${a.trim().split(/\s+/).length === 1 ? "" : "s"}, starts with ${a.trim()[0].toUpperCase()}`,
            label: `${EMOJI_CATS.find((c) => c[0] === cat)?.[1] ?? ""} · ${levelName(lv)}`,
          }));
        }}
        run={(items, again) => <RevealRun items={items} onAgain={again} />}
      />
    ),
  },
  {
    id: "bible",
    name: "Bible Trivia",
    blurb: "From Noah's ark to the judge with thirty donkeys.",
    how: HOW.bible,
    section: "quiz",
    groups: ["couple", "friends"],
    room: true,
    stat: "Easy to extremely hard",
    Play: quizPlay("bible", bibleFields, async (v) => bibleQuestions({ level: num(v.level), count: num(v.count) })),
    roomFields: bibleFields,
    buildQuestions: async (v) => bibleQuestions({ level: num(v.level), count: num(v.count) }),
  },
  {
    id: "trivia",
    name: "General Knowledge",
    blurb: "Capitals, science, history, sport.",
    how: HOW.trivia,
    section: "quiz",
    groups: ["couple", "friends"],
    room: true,
    stat: "Easy to extremely hard",
    Play: quizPlay("trivia", triviaFields, async (v) =>
      triviaQuestions({ level: num(v.level), count: num(v.count), cats: v.cats as string[] }),
    ),
    roomFields: triviaFields,
    buildQuestions: async (v) =>
      triviaQuestions({ level: num(v.level), count: num(v.count), cats: v.cats as string[] }),
  },
  {
    id: "hol",
    name: "Higher or Lower",
    blurb: "Is the next one bigger or smaller?",
    how: HOW.hol,
    section: "quiz",
    groups: ["couple", "friends"],
    room: true,
    stat: "Higher or lower",
    Play: quizPlay("hol", simpleFields(HOL_RULES), async (v) => higherLowerQuestions(quizSetup(v))),
    roomFields: simpleFields(HOL_RULES),
    buildQuestions: async (v) => higherLowerQuestions(quizSetup(v)),
  },
  {
    id: "oddone",
    name: "Odd One Out",
    blurb: "Four things. One doesn't belong.",
    how: HOW.oddone,
    section: "quiz",
    groups: ["couple", "friends"],
    room: true,
    stat: "Spot the outsider",
    Play: quizPlay("oddone", simpleFields(ODD_RULES), async (v) => oddOneQuestions(quizSetup(v))),
    roomFields: simpleFields(ODD_RULES),
    buildQuestions: async (v) => oddOneQuestions(quizSetup(v)),
  },
  {
    id: "years",
    name: "Guess the Year",
    blurb: "When did it happen?",
    how: HOW.years,
    section: "quiz",
    groups: ["couple", "friends"],
    room: true,
    stat: "Date the moment",
    Play: quizPlay("years", simpleFields(YEAR_RULES), async (v) => yearQuestions(quizSetup(v))),
    roomFields: simpleFields(YEAR_RULES),
    buildQuestions: async (v) => yearQuestions(quizSetup(v)),
  },
  {
    id: "nhie",
    name: "Never Have I Ever",
    blurb: "Clean confessions. Keep a finger down.",
    how: HOW.nhie,
    section: "talk",
    groups: ["couple", "friends"],
    scores: false,
    stat: "Fingers down",
    room: true,
    roomFields: talkFields,
    buildQuestions: pollRoom("nhie", NHIE, (x) => ({
      prompt: "Never have I ever " + x,
      options: ["I have", "Never"],
      seconds: 20,
      explain: "Anyone who has done it puts a finger down.",
    })),
    Play: deckPlay("nhie", NHIE, (x) => "Never have I ever " + x),
  },
  {
    id: "bingo",
    name: "Charades Bingo",
    blurb: "Act out squares to claim a line.",
    how: HOW.bingo,
    section: "party",
    groups: ["couple", "friends"],
    stat: "Three in a row",
    room: true,
    roomName: "Charades Bingo (turns)",
    roomBlurb: "One acts, the rest guess. Turn after turn.",
    roomFields: [
      timeField(
        "sec",
        "Time to act",
        [
          [90, "Easy, 90s"],
          [60, "Normal, 60s"],
          [30, "Hard, 30s"],
        ],
        60,
      ),
      ...turnFields,
    ],
    liveBuild: (v) => ({
      kind: "perform",
      items: shuffle(BINGO).map((w) => ({ w })),
      turns: num(v.count) || 6,
      seconds: num(v.sec) || 60,
      buzz: false,
    }),
    Play: () => (
      <SetupThen
        id="bingo"
        fields={[
          timeField(
            "sec",
            "Time to act",
            [
              [90, "Easy, 90s"],
              [60, "Normal, 60s"],
              [30, "Hard, 30s"],
            ],
            60,
          ),
        ]}
        build={(v) => ({ sec: num(v.sec) })}
        run={(d, again) => <CharadesBingo seconds={d.sec} onAgain={again} />}
      />
    ),
  },
  {
    id: "wordchain",
    name: "Word Chain",
    blurb: "Start your word with the last letter.",
    how: HOW.wordchain,
    section: "words",
    groups: ["couple", "friends"],
    stat: "Beat the clock",
    room: true,
    roomFields: [
      timeField(
        "sec",
        "Time per word",
        [
          [15, "Easy, 15s"],
          [10, "Normal, 10s"],
          [6, "Hard, 6s"],
        ],
        10,
      ),
    ],
    liveBuild: (v) => ({ kind: "chain", start: draw("chainstart", STARTS), seconds: num(v.sec) || 10 }),
    Play: () => (
      <SetupThen
        id="wordchain"
        fields={[
          timeField(
            "sec",
            "Time per word",
            [
              [15, "Easy, 15s"],
              [10, "Normal, 10s"],
              [6, "Hard, 6s"],
            ],
            10,
          ),
        ]}
        build={(v) => ({ sec: num(v.sec) })}
        run={(d, again) => <WordChain seconds={d.sec} onAgain={again} />}
      />
    ),
  },
  {
    id: "match",
    name: "Memory Match",
    blurb: "Match each picture to its name.",
    how: HOW.match,
    section: "pictures",
    groups: ["couple", "friends"],
    stat: "Find the pairs",
    room: true,
    roomName: "Memory Match (shared board)",
    roomFields: [
      timeField(
        "pairs",
        "How many pairs",
        [
          [6, "6"],
          [8, "8"],
          [10, "10"],
          [12, "12"],
        ],
        8,
      ),
    ],
    liveBuild: (v) => ({
      kind: "memory",
      symbols: drawMany("match-room", emojiPool("mixed"), num(v.pairs) || 8).map((p) => p[0]),
    }),
    Play: () => (
      <SetupThen
        id="match"
        fields={matchFields}
        build={matchPairs}
        run={(pairs, again) => <MemoryMatch pairs={pairs} onAgain={again} />}
      />
    ),
  },
  {
    id: "draw",
    name: "Draw and Guess",
    blurb: "Sketch it on the screen. Others guess.",
    how: HOW.draw,
    section: "party",
    groups: ["couple", "friends"],
    stat: "Draw on the phone",
    room: true,
    roomFields: [
      levelField(1, RULES.emoji),
      countField(4, [2, 4, 6, 10], "count", "How many drawings", "drawings in total"),
      timeField(
        "sec",
        "Time to draw",
        [
          [90, "90s"],
          [60, "60s"],
          [30, "30s"],
        ],
        60,
      ),
    ],
    liveBuild: (v) => ({
      kind: "draw",
      words: drawMany(
        "drawroom",
        DRAWWORDS.filter((w) => !num(v.level) || w[0] === num(v.level)),
        num(v.count) || 4,
      ).map((w) => w[1]),
      seconds: num(v.sec) || 60,
    }),
    Play: () => (
      <SetupThen
        id="draw"
        fields={[
          levelField(1, RULES.emoji),
          countField(4, [2, 4, 6, 10], "count", "How many drawings", "drawings in total"),
          timeField(
            "sec",
            "Time to draw",
            [
              [90, "90s"],
              [60, "60s"],
              [30, "30s"],
            ],
            60,
          ),
        ]}
        build={(v) => ({ lv: num(v.level), sec: num(v.sec), total: num(v.count) })}
        run={(d, again) => (
          <DrawGuess
            words={DRAWWORDS.filter((w) => !d.lv || w[0] === d.lv)}
            seconds={d.sec}
            total={d.total}
            onAgain={again}
          />
        )}
      />
    ),
  },
  {
    id: "bucket",
    name: "Couples Bucket List",
    blurb: "Vote in secret and find what you both want.",
    how: HOW.bucket,
    section: "talk",
    groups: ["couple"],
    scores: false,
    stat: "Dreams in common",
    room: true,
    roomFields: talkFields,
    buildQuestions: pollRoom(
      "bucket",
      BUCKET.map((b) => b[1]),
      (x) => ({
        prompt: x,
        options: ["Yes please", "Maybe", "Not for me"],
        seconds: 20,
        explain: "Everyone voted in secret. The bars show what the room wants to do together.",
      }),
    ),
    Play: () => {
      const [k, setK] = useState(0);
      return <BucketList key={k} onAgain={() => setK((x) => x + 1)} />;
    },
  },
  {
    id: "ladder",
    name: "Word Ladder",
    blurb: "Turn FAST into SLOW, one letter at a time.",
    how: HOW.ladder,
    section: "words",
    groups: ["couple", "friends"],
    stat: "Change one letter",
    room: true,
    roomName: "Word Ladder (team)",
    roomBlurb: "Two phones, one ladder. Solve it together.",
    roomFields: [
      { key: "teams", legend: "Who plays together?", options: [...TEAM_OPTIONS.teams], def: 0 },
      { key: "vs", legend: "How do you play against each other?", options: [...TEAM_OPTIONS.vs], def: "race" },
      { key: "within", legend: "Inside a team", options: [...TEAM_OPTIONS.within], def: "free" },
      levelField(1, LADDER_RULES),
      laddersField,
    ],
    teamBuild: (v) => {
      const lv = num(v.level);
      const pool = LADDER.puzzles.filter((p) => !lv || p[0] === lv);
      return drawFresh("ladder-" + lv, pool, num(v.rounds), (p: [number, string, string, number]) => p[1] + p[2]);
    },
    Play: () => (
      <SetupThen
        id="ladder"
        fields={[levelField(1, LADDER_RULES), laddersField]}
        build={(v) => {
          const lv = num(v.level);
          const pool = LADDER.puzzles.filter((p) => !lv || p[0] === lv);
          return drawFresh("ladder-" + lv, pool, num(v.rounds), (p: [number, string, string, number]) => p[1] + p[2]);
        }}
        run={(list, again) => <WordLadder puzzles={list} onAgain={again} />}
      />
    ),
  },
  {
    id: "clues",
    name: "Three Clues",
    blurb: "Three clues, one word. The fewer clues you need, the more you score.",
    how: HOW.clues,
    section: "quiz",
    groups: ["couple", "friends"],
    room: true,
    stat: "3, 2, 1 points",
    Play: () => (
      <SetupThen
        id="clues"
        fields={clueFields}
        build={(v) => drawFresh("clues-" + num(v.level), cluePool(v), num(v.count), (c) => c[2])}
        run={(list, again) => <ClueRun items={list} onAgain={again} />}
      />
    ),
    roomFields: clueFields,
    buildQuestions: async (v) =>
      drawFresh("clues-" + num(v.level), cluePool(v), num(v.count), (c) => c[2]).map<HostQuestion>((c) => {
        // Wrong answers are the same kind of thing (a person, a place, an animal...), so the kind never gives it away.
        const kin = CLUES.filter((x) => x[2] !== c[2] && CLUE_FAMILY[x[1]] === CLUE_FAMILY[c[1]]);
        const near = kin.filter((x) => Math.abs(x[0] - c[0]) <= 1);
        const pick = shuffle(near.length >= 3 ? near : kin)
          .slice(0, 3)
          .map((x) => x[2]);
        const options = shuffle([c[2], ...pick]);
        return {
          prompt: "Who or what am I?",
          options,
          correct: options.indexOf(c[2]),
          seconds: 30,
          points: 1,
          clues: [c[3], c[4], c[5]],
          label: levelName(c[0]),
          explain: `It was ${c[2]}.`,
        };
      }),
  },
  {
    id: "proverbs",
    name: "Finish the Proverb",
    blurb: "African, English and Bible sayings.",
    how: HOW.proverbs,
    section: "quiz",
    groups: ["couple", "friends"],
    stat: "Finish the saying",
    room: true,
    roomFields: proverbFields,
    buildQuestions: async (v) =>
      drawFresh("proverbs-" + num(v.level), proverbPool(v), num(v.count), (p) => p[1] + p[2]).map<HostQuestion>(
        ([lv, q, a]) => {
          const options = shuffle([
            a,
            ...shuffle(PROVERBS.filter((p) => p[2] !== a))
              .slice(0, 3)
              .map((p) => p[2]),
          ]);
          return { prompt: q, options, correct: options.indexOf(a), seconds: 15, points: lv };
        },
      ),
    Play: () => (
      <SetupThen
        id="proverbs"
        fields={proverbFields}
        build={(v) =>
          drawFresh("proverbs-" + num(v.level), proverbPool(v), num(v.count), (p) => p[1] + p[2]).map(([lv, q, a]) => ({
            prompt: q,
            answer: a,
            points: lv,
          }))
        }
        run={(list, again) => <RevealRun onAgain={again} items={list} />}
      />
    ),
  },
  {
    id: "knowme",
    name: "How Well Do You Know Me?",
    blurb: "One person secretly answers, everyone guesses.",
    how: HOW.knowme,
    section: "talk",
    groups: ["couple", "friends"],
    minPlayers: 2,
    stat: "Test each other",
    room: true,
    roomFields: [countField(6, [3, 6, 9, 12], "count", "How many rounds", "rounds in total")],
    liveBuild: (v) => ({ kind: "knowme", questions: drawMany("knowme", KNOWME, num(v.count) || 6) }),
    Play: () => <KnowMe questions={KNOWME} />,
  },
  {
    id: "couple",
    name: "Couple Questions",
    blurb: "Conversation cards for the two of you.",
    how: HOW.couple,
    section: "talk",
    groups: ["couple"],
    scores: false,
    stat: "Conversation cards",
    room: true,
    roomFields: talkFields,
    buildQuestions: pollRoom("couple", COUPLE, (x) => ({
      prompt: x,
      options: ["Next card"],
      seconds: 60,
      explain: "Take your time. Skip it if you like.",
    })),
    Play: deckPlay("couple", COUPLE),
  },
  {
    id: "wyr",
    name: "Would You Rather",
    blurb: "Pick a side and defend it.",
    how: HOW.wyr,
    section: "talk",
    groups: ["couple", "friends"],
    scores: false,
    stat: "Pick a side",
    room: true,
    roomFields: talkFields,
    buildQuestions: pollRoom("wyr", WYR, (x) => ({
      prompt: "Would you rather " + x[0].toLowerCase() + x.slice(1),
      options: ["First option", "Second option"],
      seconds: 25,
      explain: "Defend your pick in one sentence.",
    })),
    Play: deckPlay("wyr", WYR, (x) => "Would you rather " + x[0].toLowerCase() + x.slice(1)),
  },
  {
    id: "likely",
    name: "Who's Most Likely To…",
    blurb: "Point at the guilty party.",
    how: HOW.likely,
    section: "talk",
    groups: ["friends"],
    minPlayers: 3,
    scores: false,
    stat: "Point and vote",
    room: true,
    roomFields: talkFields,
    buildQuestions: pollRoom("likely", LIKELY, (x, names) => ({
      prompt: `Who's most likely to ${x}?`,
      options: names,
      seconds: 25,
      explain: "Whoever got the most votes explains themselves.",
    })),
    Play: deckPlay("likely", LIKELY, (x) => `Who's most likely to ${x}?`),
  },
  {
    id: "hotseat",
    name: "Hot Seat",
    blurb: "Rapid-fire questions for one person.",
    how: HOW.hotseat,
    section: "talk",
    groups: ["friends"],
    scores: false,
    stat: "Spotlight cards",
    room: true,
    roomFields: talkFields,
    buildQuestions: pollRoom("hotseat", HOTSEAT, (x) => ({
      prompt: x,
      options: ["Next card"],
      seconds: 45,
      explain: "Ask the hot seat this one.",
    })),
    Play: deckPlay("hotseat", HOTSEAT),
  },
  {
    id: "twotruths",
    name: "Two Truths and a Lie",
    blurb: "Spot the fib.",
    how: HOW.twotruths,
    section: "talk",
    groups: ["couple", "friends"],
    scores: false,
    stat: "Spot the lie",
    room: true,
    roomFields: talkFields,
    buildQuestions: pollRoom("twotruths", TWOTRUTHS, (x) => ({
      prompt: `Topic: ${x}. The speaker tells two truths and a lie. Which one is the lie?`,
      options: ["Statement 1", "Statement 2", "Statement 3"],
      seconds: 45,
      explain: "The speaker now reveals the lie.",
    })),
    Play: deckPlay("twotruths", TWOTRUTHS, (x) => `Topic: ${x}`),
  },
  {
    id: "charades",
    name: "Charades Sprint",
    blurb: "Act it out, no talking, 60 seconds.",
    how: HOW.charades,
    section: "party",
    groups: ["friends"],
    minPlayers: 2,
    stat: "Act it out",
    room: true,
    roomFields: turnFields,
    liveBuild: (v) => ({
      kind: "perform",
      items: shuffle(CHARADES).map((w) => ({ w })),
      turns: num(v.count) || 6,
      seconds: 60,
      buzz: false,
    }),
    Play: () => (
      <SetupThen
        id="charades"
        fields={turnFields}
        build={(v) => ({ total: num(v.count) })}
        run={(d, again) => (
          <TimedRun
            id="charades"
            items={CHARADES}
            seconds={60}
            total={d.total}
            onAgain={again}
            intro="Act out each word, no talking. Everyone else guesses."
            render={(w) => <p>{w}</p>}
          />
        )}
      />
    ),
  },
  {
    id: "taboo",
    name: "Don't Say It",
    blurb: "Describe the word without the banned ones.",
    how: HOW.taboo,
    section: "party",
    groups: ["friends"],
    minPlayers: 2,
    stat: "Describe without saying",
    room: true,
    roomFields: tabooFields,
    liveBuild: (v) => ({
      kind: "perform",
      items: shuffle(TABOO).map((w) => ({ w: w[0], ban: w.slice(1, 1 + (num(v.nb) || 4)) })),
      turns: num(v.count) || 6,
      seconds: 60,
      buzz: true,
    }),
    Play: () => (
      <SetupThen
        id="taboo"
        fields={tabooFields}
        build={(v) => ({ total: num(v.count), nb: num(v.nb) || 4 })}
        run={(d, again) => (
          <TimedRun
            id="taboo"
            items={TABOO.map((w) => w.slice(0, 1 + d.nb))}
            seconds={60}
            total={d.total}
            onAgain={again}
            intro="Describe each word without saying it or any banned word."
            render={(w) => (
              <div className="taboo">
                <p>{w[0]}</p>
                <ul aria-label="Banned words">
                  {w.slice(1).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
          />
        )}
      />
    ),
  },
  {
    id: "name5",
    name: "Name 5 in 10",
    blurb: "Five things, ten seconds. Go!",
    how: HOW.name5,
    section: "party",
    groups: ["couple", "friends"],
    stat: "Beat the clock",
    room: true,
    roomFields: name5RoomFields,
    liveBuild: (v) => {
      const th = v.th as string[];
      const pool = NAME5.filter((x) => th.includes(x[1]) && (!num(v.level) || x[0] === num(v.level)));
      if (v.how === "shout")
        return {
          kind: "shout",
          prompts: drawMany("name5", pool, num(v.count) || 10).map((x) => `Name 5: ${x[2]}`),
          seconds: num(v.s) || 10,
          max: 5,
        };
      return {
        kind: "words",
        rounds: drawMany("name5", pool, num(v.count) || 10).map((x) => ({
          prompt: `Name 5: ${x[2]}`,
          labels: ["1", "2", "3", "4", "5"],
        })),
        seconds: num(v.s) || 10,
        hi: 2,
        lo: 1,
        pool: true,
      };
    },
    Play: () => (
      <SetupThen
        id="name5"
        fields={name5Fields}
        build={(v) => {
          const th = v.th as string[];
          const pool = NAME5.filter((x) => th.includes(x[1]) && (!num(v.level) || x[0] === num(v.level)));
          return pool.length ? { pool, s: num(v.s), key: "name5", total: num(v.count) } : [];
        }}
        run={(d, again) =>
          Array.isArray(d) ? null : (
            <TimedRun
              id={d.key}
              items={d.pool}
              seconds={d.s}
              oneShot
              total={d.total}
              onAgain={again}
              pointsOf={(x) => x[0]}
              intro={`One category, ${d.s} seconds, name five things.`}
              render={(x) => (
                <div className="taboo">
                  <p className="small-label">{levelName(x[0])}</p>
                  <p>Name 5: {x[2]}</p>
                </div>
              )}
            />
          )
        }
      />
    ),
  },
  {
    id: "npat",
    name: "Name, Place, Animal, Thing",
    blurb: "One letter, pen and paper, 60 seconds.",
    how: HOW.npat,
    section: "party",
    groups: ["couple", "friends"],
    stat: "Pen & paper",
    room: true,
    roomFields: [countField(3, [3, 5, 8], "count", "How many rounds", "letters in total")],
    liveBuild: (v) => ({
      kind: "words",
      rounds: shuffle("ABCDEFGHIJKLMNOPRSTW".split(""))
        .slice(0, num(v.count) || 3)
        .map((letter) => ({
          prompt: "Fill them all in before time runs out.",
          labels: ["Name", "Place", "Animal", "Thing", "Food"],
          letter,
        })),
      seconds: 60,
      hi: 10,
      lo: 5,
      pool: false,
    }),
    Play: () => <NPAT />,
  },
  {
    id: "ttt",
    name: "Tic-Tac-Toe",
    blurb: "Three in a row wins.",
    how: HOW.ttt,
    section: "duel",
    groups: ["couple", "friends"],
    minPlayers: 2,
    maxPlayers: 2,
    stat: "Two players",
    room: true,
    roomName: "Tic-Tac-Toe",
    roomBlurb: "Three in a row wins. Two players.",
    roomFields: DUEL_ROOM(1, [1, 3, 5]),
    liveBuild: (v) => ({ kind: "duel", game: "ttt", best: num(v.best) || 1 }),
    Play: () => <DuelPlay game="ttt" def={1} opts={[1, 3, 5]} />,
  },
  {
    id: "c4",
    name: "Connect Four",
    blurb: "Drop discs. Four in a row wins.",
    how: HOW.c4,
    section: "duel",
    groups: ["couple", "friends"],
    minPlayers: 2,
    maxPlayers: 2,
    stat: "Two players",
    room: true,
    roomName: "Connect Four",
    roomBlurb: "Drop discs. Four in a row wins. Two players.",
    roomFields: DUEL_ROOM(1, [1, 3, 5]),
    liveBuild: (v) => ({ kind: "duel", game: "c4", best: num(v.best) || 1 }),
    Play: () => <DuelPlay game="c4" def={1} opts={[1, 3, 5]} />,
  },
  {
    id: "dots",
    name: "Dots and Boxes",
    blurb: "Draw lines. Close a box and it's yours.",
    how: HOW.dots,
    section: "duel",
    groups: ["couple", "friends"],
    minPlayers: 2,
    maxPlayers: 2,
    stat: "Two players",
    room: true,
    roomName: "Dots and Boxes",
    roomBlurb: "Draw lines. Close a box and it's yours. Two players.",
    roomFields: DUEL_ROOM(1, [1, 3, 5]),
    liveBuild: (v) => ({ kind: "duel", game: "dots", best: num(v.best) || 1 }),
    Play: () => <DuelPlay game="dots" def={1} opts={[1, 3, 5]} />,
  },
  {
    id: "rps",
    name: "Rock Paper Scissors",
    blurb: "Pick together. Rock, paper or scissors.",
    how: HOW.rps,
    section: "duel",
    groups: ["couple", "friends"],
    minPlayers: 2,
    maxPlayers: 2,
    stat: "Two players",
    room: true,
    roomName: "Rock Paper Scissors",
    roomBlurb: "Pick together. Rock, paper or scissors. Two players.",
    roomFields: DUEL_ROOM(3, [3, 5, 7]),
    liveBuild: (v) => ({ kind: "duel", game: "rps", best: num(v.best) || 3 }),
    Play: () => <DuelPlay game="rps" def={3} opts={[3, 5, 7]} hidden />,
  },
  {
    id: "ship",
    name: "Battleship",
    blurb: "Find and sink the hidden fleet.",
    how: HOW.ship,
    section: "duel",
    groups: ["couple", "friends"],
    minPlayers: 2,
    maxPlayers: 2,
    stat: "Two players",
    room: true,
    roomName: "Battleship",
    roomBlurb: "Find and sink the hidden fleet. Two players.",
    roomFields: DUEL_ROOM(1, [1, 3, 5]),
    liveBuild: (v) => ({ kind: "duel", game: "ship", best: num(v.best) || 1 }),
    Play: () => <DuelPlay game="ship" def={1} opts={[1, 3, 5]} hidden />,
  },
  {
    id: "hangman",
    name: "Hangman",
    blurb: "Guess the hidden word, one letter at a time.",
    how: HOW.hangman,
    section: "words",
    groups: ["couple", "friends"],
    stat: "Take turns on one phone",
    Play: () => {
      const fields = [levelField(1), countField(5, [3, 5, 8], "words", "How many words", "words")];
      return (
        <SetupThen
          id="hangman"
          fields={fields}
          build={(v) => ({ lv: num(v.level), n: num(v.words) || 5 })}
          run={(d, again) => (
            <Hangman words={DRAWWORDS.filter((w) => !d.lv || w[0] === d.lv)} total={d.n} onAgain={again} />
          )}
        />
      );
    },
  },
  {
    id: "wordguess",
    name: "Word Guess",
    blurb: "Find the 5-letter word in six tries.",
    how: HOW.wordguess,
    section: "words",
    groups: ["couple", "friends"],
    stat: "Take turns on one phone",
    Play: () => (
      <SetupThen
        id="wordguess"
        fields={[countField(3, [1, 3, 5], "words", "How many words", "words")]}
        build={(v) => num(v.words) || 3}
        run={(n, again) => <WordGuess total={n} onAgain={again} />}
      />
    ),
  },
  {
    id: "spy",
    name: "Find the Spy",
    blurb: "Everyone knows the place except one.",
    how: HOW.spy,
    section: "talk",
    groups: ["friends"],
    minPlayers: 3,
    stat: "Pass the phone",
    Play: () => (
      <SetupThen
        id="spy"
        fields={[
          timeField(
            "sec",
            "Time to ask questions",
            [
              [180, "3 min"],
              [300, "5 min"],
              [480, "8 min"],
            ],
            300,
          ),
        ]}
        build={(v) => num(v.sec) || 300}
        run={(sec, again) => <Spy seconds={sec} onAgain={again} />}
      />
    ),
  },
];

export const gameById = (id: string): GameDef | undefined => {
  const g = GAMES.find((x) => x.id === id);
  if (g) return g;
  const c = loadCustom().find((x) => `custom-${x.id}` === id);
  return c ? customToGame(c) : undefined;
};

export const gamesFor = (group: Group | null) => [
  ...GAMES.filter((g) => !group || g.groups.includes(group)),
  ...loadCustom().map(customToGame),
];

export function useWorldPreload(active: boolean) {
  useEffect(() => {
    if (active) void loadWorld();
  }, [active]);
}

export { shuffle };
