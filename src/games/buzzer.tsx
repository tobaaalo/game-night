import { useState } from "react";
import clsx from "clsx";
import { useCountdown } from "../components/ui";
import { nameOf, useApp } from "../lib/app";
import type { HostQuestion } from "../shared/protocol";
import { Finish } from "./frame";

const WAIT = 20;
const ANSWER = 10;

/** One question at a time. Everyone has a buzzer on the same screen. The first to buzz sees the answers. */
export function Buzzer({ questions, onAgain }: { questions: HostQuestion[]; onAgain: () => void }) {
  const { players, award } = useApp();
  const name = (i: number) => nameOf(players[i], i);
  const [qi, setQi] = useState(0);
  const [phase, setPhase] = useState<"ask" | "answer" | "reveal">("ask");
  const [by, setBy] = useState(-1);
  const [locked, setLocked] = useState<number[]>([]);
  const [verdict, setVerdict] = useState("");
  const [picked, setPicked] = useState(-1);
  const [fin, setFin] = useState(false);
  const q = questions[qi];

  const reveal = (text: string) => {
    setVerdict(text);
    setPhase("reveal");
  };
  const wrong = (who: number, chosen: number) => {
    const out = [...locked, who];
    setLocked(out);
    setPicked(chosen);
    if (out.length >= players.length) {
      reveal(`${chosen < 0 ? "Too slow" : "Not quite"}. Nobody got it. The answer is ${q.options[q.correct]}.`);
    } else {
      setPhase("ask");
      setBy(-1);
      setVerdict(`${name(who)} ${chosen < 0 ? "ran out of time" : "got it wrong"}. Everyone else can buzz.`);
    }
  };
  const [askLeft] = useCountdown(WAIT, phase === "ask", () =>
    reveal(`Nobody buzzed. The answer is ${q.options[q.correct]}.`),
  );
  const [ansLeft] = useCountdown(ANSWER, phase === "answer", () => wrong(by, -1));

  const buzz = (i: number) => {
    if (phase !== "ask" || locked.includes(i)) return;
    setBy(i);
    setPicked(-1);
    setVerdict("");
    setPhase("answer");
  };
  const answer = (idx: number) => {
    if (phase !== "answer") return;
    if (idx === q.correct) {
      award(players[by].id, q.points || 1);
      setPicked(idx);
      reveal(`${name(by)} is right! +${q.points || 1}. ${q.explain ?? ""}`.trim());
    } else wrong(by, idx);
  };
  const next = () => {
    if (qi + 1 >= questions.length) return setFin(true);
    setQi(qi + 1);
    setPhase("ask");
    setBy(-1);
    setLocked([]);
    setVerdict("");
    setPicked(-1);
  };

  if (fin) return <Finish onAgain={onAgain} />;
  if (!q) return <Finish onAgain={onAgain} />;
  return (
    <div className="qcard buzgame stack center-text">
      <div className="qmeta">
        <p className="prog">
          {qi + 1} / {questions.length}
          {q.label ? ` · ${q.label}` : ""}
        </p>
        <p className="prog mono" role="timer">
          {phase === "ask" ? askLeft : phase === "answer" ? ansLeft : ""}
        </p>
      </div>
      <h2 className={clsx("qprompt", q.prompt.length > 85 && "long")}>{q.prompt}</h2>
      <div className="buz-mid">
        {phase === "ask" && <p className="hint">Buzz in when you know it. Wrong answers lock you out.</p>}
        {phase !== "ask" && (
          <div className="options two" role="group" aria-label="Answers">
            {q.options.map((o, idx) => (
              <button
                key={o + idx}
                className={clsx(
                  "option",
                  phase === "reveal" && idx === q.correct && "right",
                  phase === "reveal" && picked === idx && idx !== q.correct && "wrong",
                )}
                onClick={() => answer(idx)}
                aria-disabled={phase !== "answer"}
              >
                <kbd>{idx + 1}</kbd>
                <span>{o}</span>
              </button>
            ))}
          </div>
        )}
        {phase === "answer" && <p className="turn">{name(by)}, your answer!</p>}
        <p className={clsx("verdict", phase === "reveal" && verdict.includes("right") && "good")} role="status">
          {verdict || " "}
        </p>
      </div>
      {phase === "answer" ? null : phase === "reveal" ? (
        <div className="actions center">
          <button className="btn" onClick={next} autoFocus>
            {qi + 1 >= questions.length ? "See the scores" : "Next question"}
          </button>
        </div>
      ) : (
        <div className="buz-pads" data-n={players.length}>
          {players.map((p, i) => (
            <button
              key={p.id}
              className={clsx("buz-pad", `z${i % 6}`)}
              onClick={() => buzz(i)}
              onPointerDown={(e) => {
                if (e.pointerType === "touch") {
                  e.preventDefault();
                  buzz(i);
                }
              }}
              disabled={locked.includes(i)}
              aria-label={`${name(i)} buzzer`}
            >
              {name(i)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
