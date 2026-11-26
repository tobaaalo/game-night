import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { TimerDial, useCountdown } from "../components/ui";
import { nameOf, useApp } from "../lib/app";
import { shuffle } from "../lib/deck";
import { Finish } from "./frame";

const DICE = [
  "AAEEGN",
  "ABBJOO",
  "ACHOPS",
  "AFFKPS",
  "AOOTTW",
  "CIMOTU",
  "DEILRX",
  "DELRVY",
  "DISTTY",
  "EEGHNW",
  "EEINSU",
  "EHRTVW",
  "EIOSST",
  "ELRTTY",
  "HIMNQU",
  "HLNNRZ",
];
const SIZE = 4;

/** A shuffled 4 by 4 board. "Q" stands for "Qu". */
export function newBoard(): string[] {
  return shuffle(DICE).map((d) => d[Math.floor(Math.random() * 6)]);
}
export const cellText = (c: string) => (c === "Q" ? "Qu" : c);
const cellWord = (c: string) => (c === "Q" ? "qu" : c.toLowerCase());

/** Squares next to each other, sideways and diagonally. */
export function touching(a: number, b: number): boolean {
  if (a === b) return false;
  const ar = Math.floor(a / SIZE);
  const ac = a % SIZE;
  const br = Math.floor(b / SIZE);
  const bc = b % SIZE;
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1;
}

export function wordScore(len: number): number {
  return len <= 2 ? 0 : len <= 4 ? 1 : len === 5 ? 2 : len === 6 ? 3 : len === 7 ? 5 : 11;
}

/** Every word in the dictionary that can be made on this board. */
export function solve(board: string[], words: string[], set: Set<string>): string[] {
  const found = new Set<string>();
  // The dictionary is sorted, so a prefix check is a binary search.
  const hasPrefix = (p: string) => {
    let lo = 0;
    let hi = words.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid] < p) lo = mid + 1;
      else hi = mid;
    }
    return lo < words.length && words[lo].startsWith(p);
  };
  const seen = new Array(board.length).fill(false);
  const go = (i: number, acc: string) => {
    const w = acc + cellWord(board[i]);
    if (!hasPrefix(w)) return;
    if (w.length >= 3 && set.has(w)) found.add(w);
    seen[i] = true;
    for (let j = 0; j < board.length; j++) if (!seen[j] && touching(i, j)) go(j, w);
    seen[i] = false;
  };
  for (let i = 0; i < board.length; i++) go(i, "");
  return [...found];
}

type Dict = { words: string[]; set: Set<string> };
let dictCache: Promise<Dict> | null = null;
function loadDict(): Promise<Dict> {
  dictCache ??= import("./boggle-words.txt?raw").then((m) => {
    const words = (m.default as string).split("\n");
    return { words, set: new Set(words) };
  });
  dictCache.catch(() => (dictCache = null));
  return dictCache;
}

interface Turn {
  found: string[];
  score: number;
}

/** Everyone gets the same board and takes a turn on the phone. Most points wins. */
export function Boggle({ seconds, onAgain }: { seconds: number; onAgain: () => void }) {
  const { players, award } = useApp();
  const name = (i: number) => nameOf(players[i], i);
  const [dict, setDict] = useState<Dict | null>(null);
  const [failed, setFailed] = useState(false);
  const [board, setBoard] = useState(newBoard);
  const [turn, setTurn] = useState(0);
  const [step, setStep] = useState<"ready" | "play" | "done" | "results">("ready");
  const [path, setPath] = useState<number[]>([]);
  const [msg, setMsg] = useState("");
  const [results, setResults] = useState<Turn[]>([]);
  const [cur, setCur] = useState<Turn>({ found: [], score: 0 });
  const [fin, setFin] = useState(false);
  const [rounds, setRounds] = useState(0);
  const msgTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    loadDict().then(setDict, () => setFailed(true));
  }, []);
  const [left] = useCountdown(seconds, step === "play", () => {
    setPath([]);
    setStep("done");
  });
  const current = path.map((i) => cellText(board[i])).join("");
  const say = (t: string) => {
    setMsg(t);
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(""), 1800);
  };
  const missed = useMemo(() => {
    if (step !== "results" || !dict) return [];
    const got = new Set(results.flatMap((r) => r.found));
    return solve(board, dict.words, dict.set)
      .filter((w) => !got.has(w))
      .sort((a, b) => b.length - a.length || a.localeCompare(b))
      .slice(0, 8);
  }, [step, dict, board, results]);

  const tap = (i: number) => {
    if (step !== "play") return;
    setMsg("");
    if (path[path.length - 1] === i) return setPath(path.slice(0, -1));
    if (path.includes(i)) return;
    if (path.length && !touching(path[path.length - 1], i)) return say("Pick a square next to the last one.");
    setPath([...path, i]);
  };
  const submit = () => {
    if (!dict) return;
    const w = path.map((i) => cellWord(board[i])).join("");
    if (w.length < 3) return say("Words need 3 letters or more.");
    if (cur.found.includes(w)) {
      setPath([]);
      return say("You already have that one.");
    }
    if (!dict.set.has(w)) {
      setPath([]);
      return say(`${w.toUpperCase()} is not a word.`);
    }
    const pts = wordScore(w.length);
    setCur({ found: [w, ...cur.found], score: cur.score + pts });
    setPath([]);
    say(`${w.toUpperCase()}  +${pts}`);
  };
  const endTurn = () => {
    const all = [...results, cur];
    setResults(all);
    setCur({ found: [], score: 0 });
    setPath([]);
    setMsg("");
    if (turn + 1 >= players.length) {
      const best = Math.max(...all.map((r) => r.score));
      if (best > 0) all.forEach((r, i) => r.score === best && award(players[i].id, 2));
      setRounds((r) => r + 1);
      setStep("results");
    } else {
      setTurn(turn + 1);
      setStep("ready");
    }
  };
  const again = () => {
    setBoard(newBoard());
    setResults([]);
    setCur({ found: [], score: 0 });
    setTurn(0);
    setStep("ready");
  };

  if (fin) return <Finish onAgain={onAgain} />;
  if (failed)
    return (
      <div className="qcard stack center-text">
        <p className="h3">The word list did not load</p>
        <p className="hint">Check your connection and try again.</p>
        <button className="btn" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!dict)
    return (
      <div className="qcard stack center-text">
        <p className="hint">Loading the word list…</p>
      </div>
    );

  if (step === "ready")
    return (
      <div className="qcard boggle stack center-text">
        <p className="turn">{name(turn)}</p>
        <p className="lede">{seconds} seconds. Link touching letters to make words of 3 letters or more.</p>
        <p className="hint">
          {turn === 0 ? "Everyone plays the same board, one at a time." : `Pass the phone to ${name(turn)}.`}
        </p>
        <button className="btn" onClick={() => setStep("play")}>
          Go
        </button>
      </div>
    );

  if (step === "play" || step === "done")
    return (
      <div className="qcard boggle stack center-text">
        <div className="bog-top">
          <span className="turn">{name(turn)}</span>
          <TimerDial left={left} total={seconds} />
          <strong className="mono" aria-label="Score">
            {cur.score}
          </strong>
        </div>
        <p className="bog-word" aria-live="polite">
          {step === "done" ? "Time's up!" : current || " "}
        </p>
        <div className="bog-grid" role="group" aria-label="Letters">
          {board.map((c, i) => (
            <button
              key={i}
              className={clsx("bog-cell", path.includes(i) && "on", path[path.length - 1] === i && "last")}
              onClick={() => tap(i)}
              disabled={step === "done"}
              aria-label={cellText(c)}
              aria-pressed={path.includes(i)}
            >
              {cellText(c)}
            </button>
          ))}
        </div>
        <p className="hint bog-msg" role="status">
          {msg || " "}
        </p>
        {step === "play" ? (
          <div className="actions center">
            <button className="btn ghost" onClick={() => setPath([])} disabled={!path.length}>
              Clear
            </button>
            <button className="btn" onClick={submit} disabled={path.length < 1}>
              Add word
            </button>
          </div>
        ) : (
          <div className="actions center">
            <button className="btn" onClick={endTurn} autoFocus>
              {turn + 1 >= players.length ? "See the results" : "Next player"}
            </button>
          </div>
        )}
        <p className="bog-found" aria-label="Words found">
          {cur.found.length ? cur.found.map((w) => w.toUpperCase()).join(" · ") : "No words yet"}
        </p>
      </div>
    );

  const top = Math.max(...results.map((r) => r.score));
  return (
    <div className="qcard boggle stack center-text">
      <p className="turn">
        {top <= 0
          ? "Nobody scored"
          : results.filter((r) => r.score === top).length > 1
            ? "A tie!"
            : `${name(results.findIndex((r) => r.score === top))} wins!`}
      </p>
      <ul className="bog-results" aria-label="Results">
        {results.map((r, i) => (
          <li key={i}>
            <span>{name(i)}</span>
            <span className="muted small">{r.found.length} words</span>
            <strong className="mono">{r.score}</strong>
          </li>
        ))}
      </ul>
      {missed.length > 0 && (
        <p className="hint">
          Nobody found: <b>{missed.map((w) => w.toUpperCase()).join(", ")}</b>
        </p>
      )}
      <div className="actions center">
        <button className="btn" onClick={again}>
          New board
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
