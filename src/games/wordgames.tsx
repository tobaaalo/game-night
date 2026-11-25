import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { TimerDial, useCountdown } from "../components/ui";
import { nameOf, useApp } from "../lib/app";
import { draw, drawMany, shuffle, startIndex } from "../lib/deck";
import { Finish, fitLen } from "./frame";
import { ANSWERS5, PLACES } from "./words5";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/* ------------------------------------------------------------------ Hangman */

const LIVES = 6;

function Gallows({ wrong }: { wrong: number }) {
  return (
    <svg className="gallows" viewBox="0 0 120 130" role="img" aria-label={`${wrong} of ${LIVES} wrong guesses`}>
      <g className="frame" fill="none" strokeWidth="4" strokeLinecap="round">
        <path d="M10 124 H70 M25 124 V10 H85 V26" />
      </g>
      <g className="body" fill="none" strokeWidth="4" strokeLinecap="round">
        {wrong > 0 && <circle cx="85" cy="38" r="12" />}
        {wrong > 1 && <path d="M85 50 V84" />}
        {wrong > 2 && <path d="M85 58 L68 74" />}
        {wrong > 3 && <path d="M85 58 L102 74" />}
        {wrong > 4 && <path d="M85 84 L70 108" />}
        {wrong > 5 && <path d="M85 84 L100 108" />}
      </g>
    </svg>
  );
}

/** One secret word. Everyone takes turns tapping a letter. Whoever fills in the last letter scores. */
export function Hangman({ words, total, onAgain }: { words: [number, string][]; total: number; onAgain: () => void }) {
  const { players, award } = useApp();
  const [round, setRound] = useState(0);
  const [word, setWord] = useState(() => draw("hangword", words)[1]);
  const [tried, setTried] = useState<string[]>([]);
  const [turn, setTurn] = useState(() => startIndex(players.length));
  const [solver, setSolver] = useState<string | null>(null);
  const cur = players[turn % players.length];
  const letters = word.toUpperCase().split("");
  const wrong = tried.filter((l) => !letters.includes(l)).length;
  const solved = letters.every((l) => !LETTERS.includes(l) || tried.includes(l));
  const lost = wrong >= LIVES;
  const done = solved || lost;
  const pickLetter = (l: string) => {
    if (done || tried.includes(l)) return;
    const next = [...tried, l];
    setTried(next);
    const nowSolved = letters.every((x) => !LETTERS.includes(x) || next.includes(x));
    if (nowSolved) {
      award(cur.id, 1);
      setSolver(cur.id);
    } else setTurn((t) => t + 1);
  };
  const nextWord = () => {
    setRound((r) => r + 1);
    setWord(draw("hangword", words)[1]);
    setTried([]);
    setSolver(null);
    setTurn((t) => t + 1);
  };
  if (round >= total) return <Finish onAgain={onAgain} />;
  return (
    <div className="qcard hang stack center-text">
      <div className="qmeta">
        <p className="prog">
          {round + 1} / {total}
        </p>
      </div>
      <p className="turn">
        {done
          ? solved
            ? `${nameOf(cur, turn % players.length)} got it!`
            : "Out of lives"
          : `${nameOf(cur, turn % players.length)}, pick a letter`}
      </p>
      <Gallows wrong={wrong} />
      <p
        className="hang-word"
        aria-label={`Word: ${letters.map((l) => (tried.includes(l) || done || !LETTERS.includes(l) ? l : "blank")).join(" ")}`}
        style={fitLen(word)}
      >
        {letters.map((l, i) => (
          <span
            key={i}
            className={clsx(
              "hang-slot",
              !LETTERS.includes(l) && "gap",
              lost && !tried.includes(l) && LETTERS.includes(l) && "missed",
            )}
          >
            {!LETTERS.includes(l) ? (l === " " ? " " : l) : tried.includes(l) || lost ? l : ""}
          </span>
        ))}
      </p>
      <div className="keys" role="group" aria-label="Letters">
        {LETTERS.map((l) => (
          <button
            key={l}
            className={clsx("key", tried.includes(l) && (letters.includes(l) ? "hit" : "miss"))}
            disabled={done || tried.includes(l)}
            onClick={() => pickLetter(l)}
            aria-label={`${l}${tried.includes(l) ? (letters.includes(l) ? ", in the word" : ", not in the word") : ""}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="actions center hang-actions">
        {done && (
          <button className="btn" onClick={nextWord} autoFocus>
            {round + 1 >= total ? "See the result" : "Next word"}
          </button>
        )}
      </div>
      <span hidden>{solver}</span>
    </div>
  );
}

/* --------------------------------------------------------------- Word Guess */

type Tile = "right" | "close" | "no";
/** Green for the right letter in the right place, yellow for the right letter elsewhere, grey for none. Repeats are counted properly. */
export function scoreGuess(guess: string, target: string): Tile[] {
  const out: Tile[] = Array(guess.length).fill("no");
  const left = target.split("");
  guess.split("").forEach((c, i) => {
    if (c === target[i]) {
      out[i] = "right";
      left[i] = "";
    }
  });
  guess.split("").forEach((c, i) => {
    if (out[i] === "right") return;
    const k = left.indexOf(c);
    if (k >= 0) {
      out[i] = "close";
      left[k] = "";
    }
  });
  return out;
}

const TRIES = 6;

/** Guess the five-letter word in six tries. Players take turns. The one who solves it scores. */
export function WordGuess({ total, onAgain }: { total: number; onAgain: () => void }) {
  const { players, award } = useApp();
  const [round, setRound] = useState(0);
  const [target, setTarget] = useState(() => draw("w5", ANSWERS5));
  const [guesses, setGuesses] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [turn, setTurn] = useState(() => startIndex(players.length));
  const [winner, setWinner] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const cur = players[turn % players.length];
  const solved = winner !== null;
  const lost = !solved && guesses.length >= TRIES;
  const done = solved || lost;
  const marks = useMemo(() => guesses.map((g) => scoreGuess(g, target)), [guesses, target]);
  // The best colour each letter has earned so far.
  const seen = useMemo(() => {
    const m: Record<string, Tile> = {};
    const rank = { no: 0, close: 1, right: 2 } as const;
    guesses.forEach((g, gi) =>
      g.split("").forEach((c, i) => (!m[c] || rank[marks[gi][i]] > rank[m[c]]) && (m[c] = marks[gi][i])),
    );
    return m;
  }, [guesses, marks]);
  const submit = () => {
    const g = text.trim().toLowerCase();
    if (!/^[a-z]{5}$/.test(g)) return setErr("Type a word with 5 letters.");
    if (guesses.includes(g)) return setErr("You already tried that one.");
    setErr("");
    const next = [...guesses, g];
    setGuesses(next);
    setText("");
    if (g === target) {
      setWinner(turn % players.length);
      award(cur.id, TRIES + 1 - next.length);
    } else if (next.length < TRIES) setTurn((t) => t + 1);
  };
  const nextWord = () => {
    setRound((r) => r + 1);
    setTarget(draw("w5", ANSWERS5));
    setGuesses([]);
    setText("");
    setErr("");
    setWinner(null);
    setTurn((t) => t + 1);
  };
  if (round >= total) return <Finish onAgain={onAgain} />;
  const label = { right: "right letter, right place", close: "right letter, wrong place", no: "not in the word" };
  return (
    <div className="qcard wguess stack center-text">
      <div className="qmeta">
        <p className="prog">
          {round + 1} / {total}
        </p>
      </div>
      <p className="turn">
        {solved
          ? `${nameOf(players[winner as number], winner as number)} solved it in ${guesses.length}!`
          : lost
            ? `It was ${target.toUpperCase()}`
            : `${nameOf(cur, turn % players.length)}'s guess`}
      </p>
      <div className="wgrid" role="grid" aria-label="Guess board">
        {Array.from({ length: TRIES }, (_, r) => (
          <div key={r} className="wrow" role="row">
            {Array.from({ length: 5 }, (_, c) => {
              const g = guesses[r];
              const m = g ? marks[r][c] : undefined;
              return (
                <span
                  key={c}
                  role="gridcell"
                  className={clsx("wtile", m)}
                  aria-label={g ? `${g[c]}, ${label[m as Tile]}` : "empty"}
                >
                  {g ? g[c].toUpperCase() : r === guesses.length && !done ? (text[c] ?? "").toUpperCase() : ""}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="hint wlegend">Green: right place. Yellow: wrong place. Grey: not in the word.</p>
      <div className="wseen" aria-label="Letters so far">
        {LETTERS.map((l) => (
          <span key={l} className={clsx("wmini", seen[l.toLowerCase()])}>
            {l}
          </span>
        ))}
      </div>
      <div className="wg-action">
        {!done ? (
          <form
            className="row-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              ref={input}
              className="input"
              value={text}
              maxLength={5}
              onChange={(e) => {
                setErr("");
                setText(e.target.value.replace(/[^a-zA-Z]/g, ""));
              }}
              placeholder="Type 5 letters"
              aria-label="Your guess"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
            <button className="btn" type="submit">
              Guess
            </button>
          </form>
        ) : (
          <button className="btn" onClick={nextWord} autoFocus>
            {round + 1 >= total ? "See the result" : "Next word"}
          </button>
        )}
      </div>
      <p className="hint wg-err" role="alert">
        {err || " "}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ Find the Spy */

/** Everyone sees the same place except the spy. Pass the phone, ask each other questions, then find the spy. */
export function Spy({ seconds, onAgain }: { seconds: number; onAgain: () => void }) {
  const { players, award } = useApp();
  const [place, setPlace] = useState(() => draw("spyplace", PLACES));
  const [spy, setSpy] = useState(() => Math.floor(Math.random() * players.length));
  const [step, setStep] = useState<"deal" | "talk" | "vote" | "guess" | "result">("deal");
  const [seat, setSeat] = useState(0);
  const [shown, setShown] = useState(false);
  const [accused, setAccused] = useState<number | null>(null);
  const [outcome, setOutcome] = useState("");
  const [started, setStarted] = useState(() => startIndex(players.length));
  const [rounds, setRounds] = useState(0);
  const [fin, setFin] = useState(false);
  const options = useMemo(
    () =>
      shuffle([
        place,
        ...drawMany(
          "spyopts" + place,
          PLACES.filter((p) => p !== place),
          5,
        ),
      ]),
    [place],
  );
  const [left] = useCountdown(seconds, step === "talk", () => setStep("vote"));
  const name = (i: number) => nameOf(players[i], i);
  const finish = (spyWins: boolean, why: string) => {
    if (spyWins) award(players[spy].id, 2);
    else players.forEach((p, i) => i !== spy && award(p.id, 1));
    setOutcome(why);
    setStep("result");
    setRounds((r) => r + 1);
  };
  const again = () => {
    setPlace(draw("spyplace", PLACES));
    setSpy(Math.floor(Math.random() * players.length));
    setStep("deal");
    setSeat(0);
    setShown(false);
    setAccused(null);
    setOutcome("");
    setStarted((s) => s + 1);
  };
  if (fin) return <Finish onAgain={onAgain} />;
  if (step === "deal")
    return (
      <div className="qcard stack center-text">
        <p className="turn">{name(seat)}</p>
        {!shown ? (
          <>
            <p className="hint">Pass the phone to {name(seat)}. Everyone else, eyes away!</p>
            <button className="btn" onClick={() => setShown(true)}>
              Show my card
            </button>
          </>
        ) : (
          <>
            {seat === spy ? (
              <p className="bigtext" style={fitLen("You are the spy")}>
                You are the spy
              </p>
            ) : (
              <>
                <p className="hint">The place is</p>
                <p className="bigtext" style={fitLen(place)}>
                  {place}
                </p>
              </>
            )}
            <p className="hint">
              {seat === spy
                ? "Work out the place from the questions. Don't get caught."
                : "Ask questions that only someone who knows the place can answer."}
            </p>
            <button
              className="btn"
              onClick={() => {
                setShown(false);
                if (seat + 1 >= players.length) setStep("talk");
                else setSeat(seat + 1);
              }}
            >
              {seat + 1 >= players.length ? "Everyone has seen it" : "Hide it and pass on"}
            </button>
          </>
        )}
      </div>
    );
  if (step === "talk")
    return (
      <div className="qcard stack center-text">
        <p className="turn">{name(started % players.length)} asks first</p>
        <TimerDial left={left} total={seconds} />
        <p className="hint">Take turns asking one question of anyone. Answer without saying the place.</p>
        <button className="btn" onClick={() => setStep("vote")}>
          We know who it is
        </button>
      </div>
    );
  if (step === "vote")
    return (
      <div className="qcard stack center-text">
        <p className="h3">Who is the spy?</p>
        <p className="hint">Talk it over. Agree on one person, then tap them.</p>
        <div className="givers" role="group" aria-label="Who is the spy?">
          {players.map((p, i) => (
            <button
              key={p.id}
              className="btn ghost"
              onClick={() => {
                setAccused(i);
                if (i === spy) setStep("guess");
                else finish(true, `${name(i)} was not the spy. The spy was ${name(spy)}, and the place was ${place}.`);
              }}
            >
              {name(i)}
            </button>
          ))}
        </div>
      </div>
    );
  if (step === "guess")
    return (
      <div className="qcard stack center-text">
        <p className="h3">You caught the spy!</p>
        <p className="hint">{name(spy)} has one last go. Tap where you think everyone is.</p>
        <div className="givers" role="group" aria-label="Where are we?">
          {options.map((o) => (
            <button
              key={o}
              className="btn ghost"
              onClick={() =>
                o === place
                  ? finish(true, `${name(spy)} was caught but guessed the place: ${place}. The spy wins.`)
                  : finish(false, `${name(spy)} guessed ${o}. It was ${place}. The others win.`)
              }
            >
              {o}
            </button>
          ))}
        </div>
        <span hidden>{accused}</span>
      </div>
    );
  return (
    <div className="qcard stack center-text">
      <p className="h3">{outcome}</p>
      <div className="actions center">
        <button className="btn" onClick={again}>
          Another round
        </button>
        {rounds > 0 && (
          <button className="btn ghost" onClick={() => setFin(true)}>
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
