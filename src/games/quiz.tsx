import { useEffect, useState } from "react";
import clsx from "clsx";
import { Choice } from "../components/ui";
import { nameOf, useApp } from "../lib/app";
import { load, save } from "../lib/store";
import type { HostQuestion } from "../shared/protocol";
import { Finish, MediaView, Turn, useKeys } from "./frame";

export interface Field {
  key: string;
  legend: string;
  options: { value: string | number; label: string; count?: number; rule?: string }[];
  multi?: boolean;
  def: string | number | (string | number)[];
}
export type SetupValues = Record<string, string | number | (string | number)[]>;

/** Setup screen: sensible defaults, remembered per game, one Start button. */
export function Setup({
  id,
  fields,
  onStart,
  startLabel = "Start",
  note,
  error,
  disabled,
}: {
  disabled?: boolean;
  id: string;
  fields: Field[];
  onStart: (v: SetupValues) => void;
  startLabel?: string;
  note?: string;
  error?: string;
}) {
  const [v, setV] = useState<SetupValues>(() => {
    const saved = load<SetupValues>(`gn.setup.${id}`, {});
    const out: SetupValues = {};
    for (const f of fields) {
      const s = saved[f.key];
      const valid = Array.isArray(s)
        ? s.every((x) => f.options.some((o) => o.value === x))
        : f.options.some((o) => o.value === s);
      out[f.key] = s !== undefined && valid ? s : f.def;
    }
    return out;
  });
  const empty = fields.some((f) => f.multi && (v[f.key] as unknown[]).length === 0);
  return (
    <form
      className="setup stagger"
      onSubmit={(e) => {
        e.preventDefault();
        if (empty) return;
        save(`gn.setup.${id}`, v);
        onStart(v);
      }}
    >
      {fields.map((f) => (
        <Choice
          key={f.key}
          legend={f.legend}
          options={f.options}
          value={v[f.key] as never}
          multi={f.multi}
          onChange={(x) => setV((p) => ({ ...p, [f.key]: x as never }))}
        />
      ))}
      {note && <p className="hint">{note}</p>}
      {(empty || error) && (
        <p className="error-text" role="alert">
          {empty ? "Pick at least one option above to start." : error}
        </p>
      )}
      <div className="dock">
        <button className="btn block" type="submit" disabled={empty || disabled}>
          {startLabel}
        </button>
      </div>
    </form>
  );
}

/** Pass-the-phone runner for multiple-choice questions. Players take turns. */
export function QuizRun({ questions, onAgain }: { questions: HostQuestion[]; onAgain: () => void }) {
  const { players, award } = useApp();
  const [i, setI] = useState(0);
  const [turn, setTurn] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const q = questions[i];
  const current = players[turn % players.length];

  const choose = (idx: number) => {
    if (picked != null || !q) return;
    setPicked(idx);
    if (idx === q.correct) award(current.id, q.points);
  };
  const next = () => {
    if (picked == null) return;
    setPicked(null);
    setTurn((t) => (t + 1) % players.length);
    setI((x) => x + 1);
  };
  useKeys(
    (k, e) => {
      if (picked == null && /^[1-9]$/.test(k) && q && +k <= q.options.length) choose(+k - 1);
      else if (picked != null && (k === " " || k === "Enter")) {
        e.preventDefault();
        next();
      }
    },
    [picked, q, turn],
  );
  useEffect(() => {
    if (picked != null) document.getElementById("next-btn")?.focus();
  }, [picked]);

  if (!q) return <Finish onAgain={onAgain} />;
  const right = picked === q.correct;
  return (
    <div className="qcard" key={i}>
      <div className="qmeta">
        <Turn id={current.id} />
        <p className="prog">
          {i + 1} / {questions.length}
          {q.label ? ` · ${q.label}` : ""} · {q.points} {q.points === 1 ? "pt" : "pts"}
        </p>
      </div>
      <h2 className="qprompt">{q.prompt}</h2>
      <MediaView
        media={q.media}
        revealed={picked != null}
        captions={q.captions}
        onPick={q.media?.type === "pair" ? choose : undefined}
        states={q.options.map(
          (_, idx) => picked != null && (idx === q.correct ? "right" : picked === idx ? "wrong" : undefined),
        )}
      />
      <div
        className={clsx("options", q.options.length === 2 && "two")}
        role="group"
        aria-label="Answers"
        hidden={q.media?.type === "pair"}
      >
        {q.options.map((o, idx) => (
          <button
            key={o + idx}
            className={clsx(
              "option",
              picked != null && idx === q.correct && "right",
              picked === idx && idx !== q.correct && "wrong",
            )}
            onClick={() => choose(idx)}
            aria-disabled={picked != null}
          >
            <kbd>{idx + 1}</kbd>
            <span>{o}</span>
          </button>
        ))}
      </div>
      <div aria-live="polite" className="reveal-line">
        {picked != null && (
          <>
            <p className={clsx("verdict", right ? "good" : "bad")}>
              {right ? `Correct! +${q.points} for ${nameOf(current, turn % players.length)}.` : "Not quite."}{" "}
              {q.explain}
            </p>
            <button id="next-btn" className="btn" onClick={next}>
              {i + 1 < questions.length ? "Next question" : "See the scores"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
