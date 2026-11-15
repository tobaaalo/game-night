import { useEffect, useState, type ReactNode } from "react";
import type { HostQuestion } from "../shared/protocol";
import {
  CHARADES,
  COUPLE,
  EMOJI,
  EMOJI_CATS,
  ATHLETES,
  FACE_CATS,
  SPORT_LIST,
  FACE_CATS_DEFAULT,
  HOTSEAT,
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
import type { Group } from "../lib/app";
import { drawMany, shuffle } from "../lib/deck";
import {
  bibleQuestions,
  faceQuestions,
  facePool,
  realAiQuestions,
  triviaQuestions,
  worldQuestions,
  athletePool,
  athleteQuestions,
} from "./generators";
import { QuizRun, Setup, type Field, type SetupValues } from "./quiz";
import { CardDeck, KnowMe, NPAT, RevealRun, TimedRun, type RevealItem } from "./party";
import { loadCustom, customToGame } from "../lib/custom";

export type Section = "pictures" | "quiz" | "talk" | "party" | "yours";
export const SECTIONS: Record<Section, { title: string; blurb: string }> = {
  pictures: { title: "Picture rounds", blurb: "Faces, flags and fakes" },
  quiz: { title: "Quiz show", blurb: "Four options, one right answer" },
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
  room?: boolean;
  scores?: boolean;
  stat: string;
  /** Rendered inside GameFrame */
  Play: () => ReactNode;
  /** For room mode: setup fields + question builder */
  roomFields?: Field[];
  buildQuestions?: (v: SetupValues) => Promise<HostQuestion[]>;
}

const levelField = (def = 1, rules?: Record<number, string>): Field => ({
  key: "level",
  legend: "Level",
  options: LEVELS.map((l) => ({ value: l.value, label: l.label, rule: rules?.[l.value] })),
  def,
});
const RULES = {
  bible: {
    1: "Stories a child learns in Sunday school.",
    2: "Well-known people and events most churchgoers know.",
    3: "Specific details: lesser characters, places and numbers.",
    4: "Deep cuts: genealogies, minor figures and exact facts.",
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
const countField = (def = 10): Field => ({
  key: "count",
  legend: "How many",
  options: [5, 10, 15, 20].map((n) => ({ value: n, label: String(n) })),
  def,
});

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
    key: "leagues",
    legend: "Football leagues",
    multi: true,
    options: [
      ["EPL", "Premier League"],
      ["LaLiga", "La Liga"],
      ["SerieA", "Serie A"],
      ["Bundesliga", "Bundesliga"],
      ["Ligue1", "Ligue 1"],
      ["Africa", "Africa"],
      ["Women", "Women's"],
      ["Other", "Other"],
    ].map(([value, label]) => ({ value, label })),
    def: ["EPL", "LaLiga", "SerieA", "Bundesliga", "Ligue1", "Africa", "Women", "Other"],
  },
  {
    key: "eras",
    legend: "Era",
    multi: true,
    options: [
      ["90s", "1990s"],
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
  leagues: v.leagues as string[],
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

export const GAMES: GameDef[] = [
  {
    id: "faces",
    name: "Famous Faces",
    blurb: "Who's this? Leaders, actors, singers and thinkers.",
    how: "A famous face appears. In 'Shout it out', whoever names them first gets the points. On Medium and harder you can show their initials for one point less. In 'Pick from four', players take turns choosing the right name. Less famous people are worth more.",
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
    how: "A sports star appears. In 'Shout it out', whoever names them first gets the points. On Medium and harder you can show their initials for one point less. In 'Pick from four', players take turns choosing the right name. Less famous people are worth more.",
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
              items={drawMany("sports", athletePool(d.level, d.cats, d.leagues, d.eras), d.count).map<RevealItem>(
                (f) => ({
                  prompt: "Who is this?",
                  answer: f.name,
                  points: Math.max(1, f.level),
                  label: levelName(f.level),
                  image: { src: `/faces/${f.id}.jpg`, alt: "A sports star" },
                  hint: f.name
                    .split(/\s+/)
                    .map((w) => w[0] + ".")
                    .join(" "),
                }),
              )}
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
    how: "Two pictures (or two short texts) side by side. One is real, the other was made by AI to copy it. Each round asks either which one is AI or which one is real. Green shows the right answer.",
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
    how: "Work out the country from its flag, its outline, its capital, a famous fact about it, or a word of local slang. Harder countries are worth more points.",
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
    how: "Guess the film, show, Bible story, saying, place, food, job or sport from the emojis. First to shout the right answer gets the points; harder levels score more.",
    section: "pictures",
    groups: ["couple", "friends"],
    stat: "Guess from emojis",
    Play: () => (
      <SetupThen
        id="emoji"
        fields={[
          {
            key: "cats",
            legend: "Categories",
            options: EMOJI_CATS.map(([value, label]) => ({ value, label })),
            def: EMOJI_CATS.map((c) => c[0]),
            multi: true,
          },
          levelField(0, RULES.emoji),
          countField(),
        ]}
        build={(v) => {
          const cats = v.cats as string[];
          const pool = EMOJI.filter((e) => cats.includes(e[0]) && (!num(v.level) || e[1] === num(v.level)));
          return drawMany("emoji", pool, num(v.count)).map<RevealItem>(([cat, lv, q, a]) => ({
            prompt: q,
            answer: a,
            points: lv,
            big: true,
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
    how: "Players take turns answering. Pick a level from Easy to Extremely hard. Harder questions are worth more points.",
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
    how: "Players take turns answering. Pick a level from Easy to Extremely hard. Harder questions are worth more points.",
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
    id: "proverbs",
    name: "Finish the Proverb",
    blurb: "African, English and Bible sayings.",
    how: "Read the first half aloud. Whoever finishes it correctly first gets the point.",
    section: "quiz",
    groups: ["couple", "friends"],
    stat: "Finish the saying",
    Play: () => {
      const [k, setK] = useState(0);
      return (
        <RevealRun
          key={k}
          onAgain={() => setK((x) => x + 1)}
          items={drawMany("proverbs", PROVERBS, PROVERBS.length).map(([q, a]) => ({ prompt: q, answer: a, points: 1 }))}
        />
      );
    },
  },
  {
    id: "knowme",
    name: "How Well Do You Know Me?",
    blurb: "One person secretly answers, everyone guesses.",
    how: "One person is in the hot seat. They secretly type their real answer, then pass the phone. Everyone else guesses out loud. Reveal, then tap who got it right. The hot seat moves round each time, and questions never repeat within five rounds.",
    section: "talk",
    groups: ["couple", "friends"],
    minPlayers: 2,
    stat: "Test each other",
    Play: () => <KnowMe questions={KNOWME} />,
  },
  {
    id: "couple",
    name: "Couple Questions",
    blurb: "Conversation cards for the two of you.",
    how: "Take turns reading a card to each other and answering honestly. No points, just good conversation. Skip any card you like.",
    section: "talk",
    groups: ["couple"],
    scores: false,
    stat: "Conversation cards",
    Play: () => <CardDeck id="couple" items={COUPLE} />,
  },
  {
    id: "wyr",
    name: "Would You Rather",
    blurb: "Pick a side and defend it.",
    how: "Read it out. On three, everyone says their pick. Defend your choice in one sentence.",
    section: "talk",
    groups: ["couple", "friends"],
    scores: false,
    stat: "Pick a side",
    Play: () => <CardDeck id="wyr" items={WYR} format={(x) => "Would you rather " + x[0].toLowerCase() + x.slice(1)} />,
  },
  {
    id: "likely",
    name: "Who's Most Likely To…",
    blurb: "Point at the guilty party.",
    how: "Read the card. On three, everyone points at someone. Whoever gets the most fingers has to explain themselves.",
    section: "talk",
    groups: ["friends"],
    minPlayers: 3,
    scores: false,
    stat: "Point and vote",
    Play: () => <CardDeck id="likely" items={LIKELY} format={(x) => `Who's most likely to ${x}?`} />,
  },
  {
    id: "hotseat",
    name: "Hot Seat",
    blurb: "Rapid-fire questions for one person.",
    how: "One person sits in the hot seat for two minutes while everyone else fires questions from the cards.",
    section: "talk",
    groups: ["friends"],
    scores: false,
    stat: "Spotlight cards",
    Play: () => <CardDeck id="hotseat" items={HOTSEAT} />,
  },
  {
    id: "twotruths",
    name: "Two Truths and a Lie",
    blurb: "Spot the fib.",
    how: "Draw a topic. Tell two true things and one lie about yourself on it. Everyone guesses the lie.",
    section: "talk",
    groups: ["couple", "friends"],
    scores: false,
    stat: "Spot the lie",
    Play: () => <CardDeck id="twotruths" items={TWOTRUTHS} format={(x) => `Topic: ${x}`} />,
  },
  {
    id: "charades",
    name: "Charades Sprint",
    blurb: "Act it out, no talking, 60 seconds.",
    how: "Act out each word without talking while everyone else guesses. You have 60 seconds to get through as many as you can. A point per word guessed.",
    section: "party",
    groups: ["friends"],
    minPlayers: 2,
    stat: "Act it out",
    Play: () => (
      <TimedRun
        id="charades"
        items={CHARADES}
        seconds={60}
        intro="Act out each word, no talking. Everyone else guesses."
        render={(w) => <p>{w}</p>}
      />
    ),
  },
  {
    id: "taboo",
    name: "Don't Say It",
    blurb: "Describe the word without the banned ones.",
    how: "Describe the word without saying it or any of the banned words. 60 seconds, a point for each one guessed.",
    section: "party",
    groups: ["friends"],
    minPlayers: 2,
    stat: "Describe without saying",
    Play: () => (
      <TimedRun
        id="taboo"
        items={TABOO}
        seconds={60}
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
    ),
  },
  {
    id: "name5",
    name: "Name 5 in 10",
    blurb: "Five things, ten seconds. Go!",
    how: "You get a category and a few seconds to name five things in it out loud. Manage it and you score; harder levels score more.",
    section: "party",
    groups: ["couple", "friends"],
    stat: "Beat the clock",
    Play: () => (
      <SetupThen
        id="name5"
        fields={[
          {
            key: "th",
            legend: "Themes",
            options: N5_THEMES.map(([value, label]) => ({ value, label })),
            def: N5_THEMES.map((t) => t[0]),
            multi: true,
          },
          levelField(1, RULES.name5),
          {
            key: "s",
            legend: "Seconds on the clock",
            options: [10, 15, 20].map((n) => ({ value: n, label: `${n}s` })),
            def: 10,
          },
        ]}
        build={(v) => {
          const th = v.th as string[];
          const pool = NAME5.filter((x) => th.includes(x[1]) && (!num(v.level) || x[0] === num(v.level)));
          return pool.length ? { pool, s: num(v.s), key: "name5" } : [];
        }}
        run={(d) =>
          Array.isArray(d) ? null : (
            <TimedRun
              id={d.key}
              items={d.pool}
              seconds={d.s}
              oneShot
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
    how: "Everyone needs pen and paper. Get a letter and write a name, place, animal, thing and food starting with it before time runs out. Unique answers score 10, shared ones 5.",
    section: "party",
    groups: ["couple", "friends"],
    stat: "Pen & paper",
    Play: () => <NPAT />,
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
