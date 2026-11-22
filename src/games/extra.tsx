import { BOT_DELAY, botFindsWord, botRemembers, botRight, pick as pickOne, type Skill } from "../lib/bot";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { TimerDial, WhoGotIt, useCountdown } from "../components/ui";
import { nameOf, useApp } from "../lib/app";
import { draw, drawFresh, shuffle, startIndex } from "../lib/deck";
import { load, save } from "../lib/store";
import { BINGO, BUCKET, LADDER } from "../content";
import { Finish, Img, fitLen } from "./frame";

function Clock({ seconds, onEnd }: { seconds: number; onEnd: () => void }) {
  const [left] = useCountdown(seconds, true, onEnd);
  return <TimerDial left={left} total={seconds} />;
}

/* ---------- Charades Bingo ---------- */
const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function CharadesBingo({ seconds, onAgain }: { seconds: number; onAgain: () => void }) {
  const { players, award } = useApp();
  const [cells] = useState(() => drawFresh("bingo", BINGO, 9));
  const [owner, setOwner] = useState<(string | null)[]>(() => Array<string | null>(9).fill(null));
  const [turn, setTurn] = useState(() => startIndex(players.length));
  const [acting, setActing] = useState<number | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const cur = players[turn % players.length];
  const full = owner.every(Boolean);
  const idxOf = (id: string) => players.findIndex((p) => p.id === id);
  const next = () => {
    setActing(null);
    setTurn((t) => t + 1);
  };
  const claim = (at: number) => {
    const o = owner.slice();
    o[at] = cur.id;
    setOwner(o);
    award(cur.id, 1);
    if (LINES.some((l) => l.every((i) => o[i] === cur.id))) {
      award(cur.id, 3);
      setWinner(cur.id);
      setActing(null);
    } else next();
  };
  const got = () => {
    if (acting === null) return;
    claim(acting);
  };
  // The computer picks a free square and acts it out. Whether you guess it is down to how good it is.
  const botGo = () => {
    const free = owner.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
    if (!free.length) return;
    const at = pickOne(free);
    if (botRight(cur.skill, 2)) claim(at);
    else next();
  };
  if (winner || full) {
    const w = winner ? players[idxOf(winner)] : null;
    return (
      <div className="qcard stack center-text">
        <p className="h3">
          {w ? `${nameOf(w, idxOf(w.id))} got a line! +3 bonus points` : "Board full. No line this time."}
        </p>
        <Finish onAgain={onAgain} />
      </div>
    );
  }
  return (
    <div className="qcard stack">
      <p className="turn">
        {cur.bot
          ? `${nameOf(cur, turn % players.length)}'s turn`
          : `${nameOf(cur, turn % players.length)}, pick a square to act`}
      </p>
      {cur.bot && (
        <div className="actions center">
          <button className="btn" onClick={botGo}>
            Let the computer go
          </button>
        </div>
      )}
      {acting !== null && !cur.bot && (
        <div className="stack center-text">
          <Clock key={acting} seconds={seconds} onEnd={next} />
          <p className="h3">Act: {cells[acting]}</p>
          <div className="actions center">
            <button className="btn" onClick={got}>
              Guessed
            </button>
            <button className="btn ghost" onClick={next}>
              Missed
            </button>
          </div>
        </div>
      )}
      <details className="howto">
        <summary>How to play</summary>
        <ol>
          <li>Pick a square and act it out. No talking.</li>
          <li>Guessed in time? The square is yours, +1 point.</li>
          <li>Missed? The turn passes to the next player.</li>
          <li>Three in a row of your squares wins +3 bonus.</li>
          <li>Board full with no line? Nobody wins the bonus.</li>
        </ol>
      </details>
      <div className="bingo">
        {cells.map((c, i) => {
          const o = owner[i];
          return (
            <button
              key={c}
              className={clsx("bingo-cell", o && "taken", acting === i && "now")}
              disabled={!!o || acting !== null || !!cur.bot}
              onClick={() => setActing(i)}
            >
              {o ? <b>{nameOf(players[idxOf(o)], idxOf(o)).slice(0, 2)}</b> : <span>{c}</span>}
            </button>
          );
        })}
      </div>
      <p className="hint center-text">Get three in a row to win. Miss and the next player goes.</p>
    </div>
  );
}

/* ---------- Word Chain ---------- */
export const MIN_WORD = 5;
export const STARTS = [
  "apple",
  "river",
  "table",
  "music",
  "orange",
  "garden",
  "island",
  "window",
  "ladder",
  "mirror",
  "pepper",
  "sunset",
  "nature",
  "engine",
  "market",
];

export function WordChain({ seconds, onAgain }: { seconds: number; onAgain: () => void }) {
  const { players, award } = useApp();
  const [start] = useState(() => draw("chainstart", STARTS));
  const [chain, setChain] = useState<string[]>([start]);
  const [out, setOut] = useState<string[]>([]);
  const [turn, setTurn] = useState(() => startIndex(players.length));
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const alive = players.filter((p) => !out.includes(p.id));
  const solo = players.length < 2;
  const cur = alive.length ? alive[turn % alive.length] : players[0];
  const last = chain[chain.length - 1];
  function knockOut() {
    if (solo) {
      setDone(true);
      return;
    }
    const nowOut = [...out, cur.id];
    setOut(nowOut);
    const rest = players.filter((p) => !nowOut.includes(p.id));
    if (rest.length <= 1) {
      if (rest[0]) award(rest[0].id, 2);
      setDone(true);
    }
  }
  // The computer plays a word from a list of everyday words. Easy knows fewer words and gives up sooner.
  useEffect(() => {
    if (done || !cur.bot) return;
    let live = true;
    const t = setTimeout(
      async () => {
        const all = (await import("../content/botwords.json")).default as string[];
        if (!live) return;
        const pool = all.slice(0, [2500, 6000, 12000][(cur.skill ?? 2) - 1]);
        const l = last[last.length - 1];
        const ok = pool.filter((w) => w[0] === l && !chain.includes(w));
        const fail = chain.length > 3 && !botFindsWord(cur.skill as Skill);
        if (!ok.length || fail) return knockOut();
        setChain((c) => [...c, pickOne(ok.slice(0, 40))]);
        setTurn((n) => n + 1);
      },
      BOT_DELAY + Math.random() * 700,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [chain.length, out.length, done]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => {
    const w = text.trim().toLowerCase();
    if (!/^[a-z]+$/.test(w)) return setErr("Letters only, please.");
    if (w.length < MIN_WORD) return setErr(`Words need at least ${MIN_WORD} letters.`);
    if (w[0] !== last[last.length - 1]) return setErr(`It must start with “${last[last.length - 1].toUpperCase()}”.`);
    if (chain.includes(w)) return setErr("That word has been used.");
    setErr("");
    setChain([...chain, w]);
    setText("");
    setTurn((t) => t + 1);
  };
  if (done)
    return (
      <div className="qcard stack center-text">
        <p className="h3">
          {solo
            ? `Chain of ${chain.length - 1} words`
            : `${nameOf(
                alive[0] ?? cur,
                players.findIndex((p) => p.id === (alive[0] ?? cur).id),
              )} wins! +2 points`}
        </p>
        <p className="hint">{chain.join(" → ")}</p>
        <Finish onAgain={onAgain} />
      </div>
    );
  return (
    <div className="qcard stack center-text">
      {!solo && (
        <p className="turn">
          {nameOf(
            cur,
            players.findIndex((p) => p.id === cur.id),
          )}
          &rsquo;s turn
        </p>
      )}
      {!cur.bot && <Clock key={`${chain.length}-${out.length}`} seconds={seconds} onEnd={knockOut} />}
      <p className="bigtext" style={fitLen(last)}>
        {last}
      </p>
      {cur.bot && (
        <p className="hint">
          {nameOf(
            cur,
            players.findIndex((p) => p.id === cur.id),
          )}{" "}
          is thinking&hellip;
        </p>
      )}
      <p className="hint">
        Say a word starting with “{last[last.length - 1].toUpperCase()}”. Type it to lock it in. Words must be at least{" "}
        {MIN_WORD} letters long.
      </p>
      <form
        className="stack"
        hidden={!!cur.bot}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          aria-label="Your word"
        />
        {err && (
          <p className="error-text" role="alert">
            {err}
          </p>
        )}
        <button className="btn" type="submit">
          Lock it in
        </button>
      </form>
      <p className="hint">Words so far: {chain.length - 1}. No repeats. Run out of time and you are out.</p>
    </div>
  );
}

/* ---------- Memory Match ---------- */
export interface MatchCard {
  id: string;
  pair: number;
  img?: string;
  text?: string;
}

export function MemoryMatch({
  pairs,
  onAgain,
}: {
  pairs: [string, string | undefined, string][];
  onAgain: () => void;
}) {
  const { players, award } = useApp();
  const cols = pairs.length * 2 > 16 ? 6 : 4;
  const [cards] = useState<MatchCard[]>(() => {
    const base = pairs.flatMap(([key, img, text], i): MatchCard[] => [
      { id: `${key}-a`, pair: i, img, text: img ? undefined : key },
      { id: `${key}-b`, pair: i, text },
    ]);
    // Scatter: a card's partner must be at least three grid steps away (4 columns).
    const far = (list: MatchCard[]) => {
      const at = new Map<number, number[]>();
      list.forEach((c, i) => at.set(c.pair, [...(at.get(c.pair) ?? []), i]));
      return [...at.values()].every(
        ([i, j]) => Math.abs((i % cols) - (j % cols)) + Math.abs(Math.floor(i / cols) - Math.floor(j / cols)) >= 3,
      );
    };
    let best = shuffle(base);
    for (let t = 0; t < 400 && !far(best); t++) best = shuffle(base);
    return best;
  });
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<number[]>([]);
  const [turn, setTurn] = useState(() => startIndex(players.length));
  const [moves, setMoves] = useState(0);
  const lock = useRef(false);
  const cur = players[turn % players.length];
  const finished = found.length === pairs.length;
  // What the computer remembers: cards it has seen, and whether each one stuck. Easy forgets a lot.
  const memory = useRef(new Map<number, boolean>());
  const flip = (i: number, byBot = false) => {
    if (cur.bot && !byBot) return;
    if (lock.current || open.includes(i) || found.includes(cards[i].pair)) return;
    if (!memory.current.has(i)) memory.current.set(i, botRemembers(players.find((p) => p.bot)?.skill));
    const o = [...open, i];
    setOpen(o);
    if (o.length < 2) return;
    setMoves((m) => m + 1);
    lock.current = true;
    const hit = cards[o[0]].pair === cards[o[1]].pair;
    setTimeout(() => {
      if (hit) {
        setFound((f) => [...f, cards[o[0]].pair]);
        award(cur.id, 1);
      } else setTurn((t) => t + 1);
      setOpen([]);
      lock.current = false;
    }, 900);
  };
  useEffect(() => () => void (lock.current = false), []);
  useEffect(() => {
    if (!cur.bot || finished || open.length >= 2 || lock.current) return;
    const t = setTimeout(() => {
      const hidden = cards.map((_, i) => i).filter((i) => !found.includes(cards[i].pair) && !open.includes(i));
      const known = (i: number) => memory.current.get(i) === true;
      let at: number | undefined;
      if (open.length === 1) {
        at = hidden.find((i) => known(i) && cards[i].pair === cards[open[0]].pair);
        at ??= pickOne(
          hidden
            .filter((i) => !memory.current.has(i))
            .concat(hidden.filter((i) => !known(i) && memory.current.has(i) && cards[i].pair !== cards[open[0]].pair)),
        );
      } else {
        const seen = hidden.filter(known);
        const pair = seen.find((i) => seen.some((j) => j !== i && cards[j].pair === cards[i].pair));
        at = pair ?? pickOne(hidden.filter((i) => !memory.current.has(i)).concat([]));
      }
      flip(at ?? pickOne(hidden), true);
    }, 850);
    return () => clearTimeout(t);
  }, [turn, open.length, found.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (finished)
    return (
      <div className="qcard stack center-text">
        <p className="h3">All pairs found in {moves} moves</p>
        <Finish onAgain={onAgain} />
      </div>
    );
  return (
    <div className="qcard stack">
      <p className="turn">
        {nameOf(cur, turn % players.length)}&rsquo;s turn{cur.bot ? " (thinking)" : ""} · {moves}{" "}
        {moves === 1 ? "move" : "moves"}
      </p>
      <div className="memgrid" style={{ "--c": cols } as CSSProperties}>
        {cards.map((c, i) => {
          const up = open.includes(i) || found.includes(c.pair);
          return (
            <button
              key={c.id}
              className={clsx(
                "memcard",
                up && "up",
                found.includes(c.pair) && "won",
                c.img?.startsWith("/flags/") && "flag",
              )}
              onClick={() => flip(i)}
              aria-label={up ? (c.text ?? "Picture") : "Hidden card"}
            >
              {up ? (
                c.img ? (
                  <Img src={c.img} alt="Card" square />
                ) : (
                  <span className={/\p{Extended_Pictographic}/u.test(c.text ?? "") ? undefined : "name"}>{c.text}</span>
                )
              ) : (
                <span>?</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Draw and Guess ---------- */
const INKS = ["#1b1b1b", "#d0312d", "#1d6fd1", "#2e8b3d"];

export function DrawGuess({
  words,
  seconds,
  total,
  onAgain,
}: {
  words: [number, string][];
  seconds: number;
  total?: number;
  onAgain: () => void;
}) {
  const { players, award } = useApp();
  const [turn, setTurn] = useState(() => startIndex(players.length));
  const [phase, setPhase] = useState<"ready" | "peek" | "draw" | "judge">("ready");
  const [word, setWord] = useState<[number, string]>(() => draw("drawwords", words));
  const [ink, setInk] = useState(INKS[0]);
  const cv = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<{ c: string; p: [number, number][] }[]>([]);
  // The computer can't draw, so only people take the pen. It still tries to guess.
  const drawers = players.filter((p) => !p.bot);
  const cur = drawers[turn % drawers.length];
  const redraw = () => {
    const c = cv.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.lineWidth = 5;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const s of strokes.current) {
      g.strokeStyle = s.c;
      g.beginPath();
      s.p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (s.p.length === 1) g.lineTo(s.p[0][0] + 0.1, s.p[0][1]);
      g.stroke();
    }
  };
  const pt = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 600, ((e.clientY - r.top) / r.height) * 600];
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    strokes.current.push({ c: ink, p: [pt(e)] });
    redraw();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    const s = strokes.current[strokes.current.length - 1];
    if (!s || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    s.p.push(pt(e));
    redraw();
  };
  const nextRound = () => {
    strokes.current = [];
    setWord(draw("drawwords", words));
    setTurn((t) => t + 1);
    setPhase("ready");
  };
  const [rounds, setRounds] = useState(0);
  if (rounds >= (total ?? Math.max(2, players.length) * 2) && phase === "ready")
    return (
      <div className="qcard stack center-text">
        <p className="h3">That&rsquo;s {rounds} drawings. Nicely done.</p>
        <Finish onAgain={onAgain} />
      </div>
    );
  return (
    <div className="qcard stack center-text">
      <p className="turn">{nameOf(cur, players.indexOf(cur))} draws</p>
      {phase === "ready" && (
        <>
          <p className="hint">Only the drawer should look. Everyone else, eyes away!</p>
          <button className="btn" onClick={() => setPhase("peek")}>
            Show me the word
          </button>
        </>
      )}
      {phase === "peek" && (
        <>
          <p className="bigtext" style={fitLen(word[1])}>
            {word[1]}
          </p>
          <p className="hint">Draw it without writing letters or numbers.</p>
          <button className="btn" onClick={() => setPhase("draw")}>
            Start drawing
          </button>
        </>
      )}
      {(phase === "draw" || phase === "judge") && (
        <>
          {phase === "draw" && <Clock key={turn} seconds={seconds} onEnd={() => setPhase("judge")} />}
          <canvas
            ref={cv}
            width={600}
            height={600}
            className="drawpad"
            style={{ touchAction: "none" }}
            onPointerDown={phase === "draw" ? down : undefined}
            onPointerMove={phase === "draw" ? move : undefined}
          />
          {phase === "draw" ? (
            <div className="actions center">
              {INKS.map((c) => (
                <button
                  key={c}
                  className={clsx("ink", ink === c && "on")}
                  style={{ background: c }}
                  onClick={() => setInk(c)}
                  aria-label={`Pen colour ${c}`}
                />
              ))}
              <button
                className="btn ghost small"
                onClick={() => {
                  strokes.current.pop();
                  redraw();
                }}
              >
                Undo
              </button>
              <button className="btn small" onClick={() => setPhase("judge")}>
                Guessed
              </button>
            </div>
          ) : (
            <>
              <p className="h3">It was “{word[1]}”</p>
              <WhoGotIt
                label="Who guessed it?"
                points={1}
                exclude={cur.id}
                onDone={(ids) => {
                  ids.forEach((id) => award(id, 1));
                  if (ids.length) award(cur.id, 1);
                  setRounds((r) => r + 1);
                  nextRound();
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Couples Bucket List ---------- */
type Vote = "yes" | "maybe" | "no";
interface Saved {
  text: string;
  done: boolean;
}

export function BucketList({ onAgain }: { onAgain: () => void }) {
  const { players } = useApp();
  const [mode, setMode] = useState<"menu" | "a" | "b" | "result" | "list">("menu");
  const [ideas, setIdeas] = useState<[string, string][]>([]);
  const [votes, setVotes] = useState<[Vote[], Vote[]]>([[], []]);
  const [saved, setSaved] = useState<Saved[]>(() => load<Saved[]>("gn.bucket", []));
  const [added, setAdded] = useState("");
  const n1 = players[0] ? nameOf(players[0], 0) : "Person 1";
  const n2 = players[1] ? nameOf(players[1], 1) : "Person 2";
  const persist = (s: Saved[]) => {
    setSaved(s);
    save("gn.bucket", s);
  };
  const begin = () => {
    setIdeas(drawFresh("bucket", BUCKET, 12));
    setVotes([[], []]);
    setMode("a");
  };
  const cast = (who: 0 | 1, v: Vote) => {
    const next: [Vote[], Vote[]] = [votes[0], votes[1]];
    next[who] = [...next[who], v];
    setVotes(next);
    if (next[who].length >= ideas.length) setMode(who === 0 ? "b" : "result");
  };
  if (mode === "menu" || mode === "list")
    return (
      <div className="qcard stack center-text">
        {mode === "menu" ? (
          <>
            <p className="h3">Build your bucket list</p>
            <p className="hint">Each of you secretly votes on 12 ideas. We show what you both want.</p>
            <button className="btn" onClick={begin}>
              New round
            </button>
            <button className="btn ghost" onClick={() => setMode("list")}>
              Our list ({saved.length})
            </button>
          </>
        ) : (
          <>
            <p className="h3">Our list</p>
            {saved.length === 0 && <p className="hint">Nothing here yet. Play a round and save your matches.</p>}
            <ul className="stack" style={{ textAlign: "left", listStyle: "none", padding: 0 }}>
              {saved.map((s, i) => (
                <li key={s.text}>
                  <label>
                    <input
                      type="checkbox"
                      checked={s.done}
                      onChange={() => persist(saved.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                    />{" "}
                    <span style={{ textDecoration: s.done ? "line-through" : "none" }}>{s.text}</span>
                  </label>
                </li>
              ))}
            </ul>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const t = added.trim();
                if (t && !saved.some((s) => s.text === t)) persist([...saved, { text: t, done: false }]);
                setAdded("");
              }}
            >
              <input
                className="input"
                value={added}
                onChange={(e) => setAdded(e.target.value)}
                placeholder="Add your own idea"
              />
              <button className="btn small" type="submit">
                Add
              </button>
            </form>
            <button className="btn ghost" onClick={() => setMode("menu")}>
              Back
            </button>
          </>
        )}
      </div>
    );
  if (mode === "a" || mode === "b") {
    const who = mode === "a" ? 0 : 1;
    const i = votes[who].length;
    return (
      <div className="qcard stack center-text">
        <p className="turn">
          {who === 0 ? n1 : n2}: vote in secret ({i + 1} of {ideas.length})
        </p>
        <div className="deckcard">
          <p>{ideas[i]?.[1]}</p>
        </div>
        <div className="actions center">
          <button className="btn" onClick={() => cast(who, "yes")}>
            Yes please
          </button>
          <button className="btn ghost" onClick={() => cast(who, "maybe")}>
            Maybe
          </button>
          <button className="btn ghost" onClick={() => cast(who, "no")}>
            Not for me
          </button>
        </div>
      </div>
    );
  }
  const both = ideas.filter((_, i) => votes[0][i] === "yes" && votes[1][i] === "yes");
  const talk = ideas.filter(
    (_, i) => (votes[0][i] === "yes" && votes[1][i] === "maybe") || (votes[0][i] === "maybe" && votes[1][i] === "yes"),
  );
  return (
    <div className="qcard stack">
      <p className="h3 center-text">
        You both said yes to {both.length} {both.length === 1 ? "idea" : "ideas"}
      </p>
      <ul className="stack">
        {both.map((b) => (
          <li key={b[1]}>{b[1]}</li>
        ))}
      </ul>
      {talk.length > 0 && (
        <>
          <p className="h3">Worth a chat</p>
          <ul className="stack">
            {talk.map((b) => (
              <li key={b[1]}>{b[1]}</li>
            ))}
          </ul>
        </>
      )}
      <div className="actions center">
        <button
          className="btn"
          onClick={() => {
            persist([
              ...saved,
              ...both.filter((b) => !saved.some((s) => s.text === b[1])).map((b) => ({ text: b[1], done: false })),
            ]);
            setMode("list");
          }}
        >
          Save to our list
        </button>
        <button className="btn ghost" onClick={onAgain}>
          Done
        </button>
      </div>
    </div>
  );
}

/* ---------- Word Ladder ---------- */
type Puzzle = [number, string, string, number];
export const ABC = "abcdefghijklmnopqrstuvwxyz".split("");

let dict: Record<number, Set<string>> | null = null;
let easy: Record<number, Set<string>> | null = null;
/** Every word we accept: a full English dictionary, so real words are never turned down. */
export const wordsOf = (n: number) => {
  dict ??= {};
  return (dict[n] ??= new Set((LADDER.valid[String(n)] ?? LADDER.words[String(n)]).split(" ")));
};
/** Everyday words only. Hints and puzzles use these so they never lead you through odd words. */
const everydayOf = (n: number) => {
  easy ??= {};
  return (easy[n] ??= new Set(LADDER.words[String(n)].split(" ")));
};

function search(a: string, b: string, ws: Set<string>): string[] {
  const prev = new Map<string, string>([[a, ""]]);
  const q = [a];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    if (u === b) break;
    for (let i = 0; i < u.length; i++)
      for (const c of ABC) {
        const v = u.slice(0, i) + c + u.slice(i + 1);
        if (v !== u && !prev.has(v) && (ws.has(v) || v === b)) {
          prev.set(v, u);
          q.push(v);
        }
      }
  }
  const out: string[] = [];
  for (let w = b; w; w = prev.get(w) ?? "") out.unshift(w);
  return out[0] === a ? out : [];
}

/** Shortest route from a to b. Tries everyday words first, then any real word. */
export function route(a: string, b: string): string[] {
  return search(a, b, everydayOf(a.length)).length
    ? search(a, b, everydayOf(a.length))
    : search(a, b, wordsOf(a.length));
}

export function WordLadder({ puzzles, onAgain }: { puzzles: Puzzle[]; onAgain: () => void }) {
  const { players, award } = useApp();
  const [n, setN] = useState(0);
  const [off] = useState(() => startIndex(players.length));
  const [ladder, setLadder] = useState<string[]>([puzzles[0][1]]);
  const [pick, setPick] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [hints, setHints] = useState(0);
  const [state, setState] = useState<"play" | "won" | "gave">("play");
  const [botNote, setBotNote] = useState("");
  const [shown, setShown] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [lv, start, goal, par] = puzzles[n] ?? puzzles[0];
  const player = players[(n + off) % players.length];
  const cur = ladder[ladder.length - 1];
  const moves = ladder.length - 1;
  const finished = n >= puzzles.length;
  const tryLetter = (c: string) => {
    if (pick === null || state !== "play") return;
    const w = cur.slice(0, pick) + c + cur.slice(pick + 1);
    setPick(null);
    if (w === cur) return;
    if (ladder.includes(w)) return setMsg(`You already used “${w.toUpperCase()}”.`);
    if (w !== goal && !wordsOf(w.length).has(w)) return setMsg(`“${w.toUpperCase()}” isn't in our word list.`);
    setMsg("");
    setLadder([...ladder, w]);
    if (w === goal) {
      const pts = Math.max(0, lv + (moves + 1 <= par ? 1 : 0) - hints);
      award(player.id, pts);
      setScore((s) => s + pts);
      setState("won");
    }
  };
  const hint = () => {
    const r = route(cur, goal);
    if (r.length > 1) {
      setHints((h) => h + 1);
      setMsg(`Try “${r[1].toUpperCase()}” next.`);
    }
  };
  // The computer's ladder solves itself, or gets stuck, depending on how good it is.
  const botGo = () => {
    const path = route(start, goal);
    if (path.length > 1 && botRight(player.skill, lv)) {
      const pts = Math.max(0, lv + (path.length - 1 <= par ? 1 : 0));
      award(player.id, pts);
      setScore((x) => x + pts);
      setBotNote(
        `${player.name} solved it in ${path.length - 1} moves: ${path.map((w) => w.toUpperCase()).join(" → ")}`,
      );
    } else setBotNote(`${player.name} got stuck on this one.`);
    setState("gave");
  };
  const next = () => {
    setBotNote("");
    const k = n + 1;
    setN(k);
    if (k < puzzles.length) setLadder([puzzles[k][1]]);
    setPick(null);
    setMsg("");
    setHints(0);
    setShown([]);
    setState("play");
  };
  if (finished)
    return (
      <div className="qcard stack center-text">
        <p className="h3">
          {puzzles.length} ladders done. {score} points scored.
        </p>
        <Finish onAgain={onAgain} />
      </div>
    );
  return (
    <div className="qcard stack center-text">
      <p className="turn">
        {nameOf(player, (n + off) % players.length)} · ladder {n + 1} of {puzzles.length}
      </p>
      <p className="hint">
        Change one letter at a time to turn <b>{start.toUpperCase()}</b> into <b>{goal.toUpperCase()}</b>. Par is {par}{" "}
        moves.
      </p>
      {player.bot && state === "play" && (
        <div className="actions center">
          <button className="btn" onClick={botGo}>
            Let the computer try
          </button>
        </div>
      )}
      <ol className="ladder">
        {ladder.slice(0, -1).map((w) => (
          <li key={w}>{w.toUpperCase()}</li>
        ))}
      </ol>
      <div className="ladder-now" role="group" aria-label="Current word. Tap a letter to change it.">
        {cur.split("").map((c, i) => (
          <button
            key={i}
            className={clsx("ltile", pick === i && "on")}
            disabled={state !== "play" || !!player.bot}
            onClick={() => setPick(pick === i ? null : i)}
            aria-label={`Letter ${i + 1}: ${c}`}
          >
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="hint">
        Target: {goal.toUpperCase()} · {moves} {moves === 1 ? "move" : "moves"}
      </p>
      {pick !== null && state === "play" && (
        <div className="lpicker" role="group" aria-label="Pick a new letter">
          {ABC.map((c) => (
            <button key={c} className="lkey" onClick={() => tryLetter(c)}>
              {c.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      {msg && (
        <p className="error-text" role="status">
          {msg}
        </p>
      )}
      {state === "play" && !player.bot && (
        <div className="actions center">
          <button
            className="btn ghost small"
            disabled={ladder.length < 2}
            onClick={() => {
              setLadder(ladder.slice(0, -1));
              setMsg("");
              setPick(null);
            }}
          >
            Undo
          </button>
          <button className="btn ghost small" onClick={hint}>
            Hint (−1 point)
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              setShown(route(start, goal));
              setState("gave");
            }}
          >
            Give up
          </button>
        </div>
      )}
      {state === "won" && (
        <>
          <p className="h3">
            {moves <= par ? "Par or better!" : "Solved!"} {moves} moves
          </p>
          <button className="btn" onClick={next}>
            {n + 1 < puzzles.length ? "Next ladder" : "See results"}
          </button>
        </>
      )}
      {state === "gave" && (
        <>
          <p className="hint">{botNote || `One way through: ${shown.map((w) => w.toUpperCase()).join(" → ")}`}</p>
          <button className="btn" onClick={next}>
            {n + 1 < puzzles.length ? "Next ladder" : "See results"}
          </button>
        </>
      )}
    </div>
  );
}
