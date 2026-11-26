import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { nameOf, useApp } from "../lib/app";
import { Finish } from "./frame";

const COLOURS = ["#ff8a8a", "#6cc3ff", "#ffd966", "#7be495"];

/** Everyone taps their own coloured square on the same screen. First to the target wins the round. */
export function TapRace({ taps, rounds, onAgain }: { taps: number; rounds: number; onAgain: () => void }) {
  const { players, award } = useApp();
  const n = Math.min(players.length, 4);
  const name = (i: number) => nameOf(players[i], i);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"ready" | "count" | "go" | "won">("ready");
  const [count, setCount] = useState(3);
  const [counts, setCounts] = useState<number[]>(() => Array(n).fill(0));
  const [winner, setWinner] = useState(-1);
  const [fin, setFin] = useState(false);
  const live = useRef(counts);
  const over = useRef(false);
  live.current = counts;

  const start = () => {
    over.current = false;
    setCounts(Array(n).fill(0));
    setWinner(-1);
    setCount(3);
    setPhase("count");
  };
  useEffect(() => {
    if (phase !== "count") return;
    if (count <= 0) {
      setPhase("go");
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, count]);

  const tap = (i: number) => {
    if (phase !== "go" || over.current) return;
    const next = [...live.current];
    next[i] += 1;
    live.current = next;
    setCounts(next);
    if (next[i] >= taps) {
      over.current = true;
      setWinner(i);
      award(players[i].id, 1);
      setPhase("won");
    }
  };

  if (fin) return <Finish onAgain={onAgain} />;
  const last = round + 1 >= rounds;
  return (
    <div className="qcard taprace stack center-text" data-n={n}>
      <div className="tap-status" role="status" aria-live="polite">
        <p className="hint" style={{ margin: 0 }}>
          Round {Math.min(round + 1, rounds)} of {rounds} · first to {taps} taps
        </p>
        <p className="turn" style={{ margin: 0 }}>
          {phase === "ready"
            ? "Everyone get a finger ready"
            : phase === "count"
              ? count > 0
                ? String(count)
                : "Go!"
              : phase === "go"
                ? "TAP!"
                : `${name(winner)} wins the round!`}
        </p>
      </div>
      <div className="tap-zones">
        {Array.from({ length: n }, (_, i) => (
          <button
            key={i}
            className={clsx("tap-zone", `z${i}`, phase === "won" && winner === i && "win")}
            style={{ background: COLOURS[i] }}
            onPointerDown={(e) => {
              e.preventDefault();
              tap(i);
            }}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                tap(i);
              }
            }}
            aria-label={`${name(i)}: tap here`}
          >
            <span className="tap-name">{name(i)}</span>
            <span className="tap-count mono">{counts[i]}</span>
            <span
              className="tap-bar"
              style={{ width: `${Math.min(100, (counts[i] / taps) * 100)}%` }}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <div className="actions center tap-actions">
        {phase === "ready" && (
          <button className="btn" onClick={start}>
            Start
          </button>
        )}
        {phase === "won" &&
          (last ? (
            <button className="btn" onClick={() => setFin(true)}>
              See the result
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => {
                setRound(round + 1);
                start();
              }}
            >
              Next round
            </button>
          ))}
      </div>
    </div>
  );
}
