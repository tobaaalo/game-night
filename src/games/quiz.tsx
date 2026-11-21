import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Choice } from "../components/ui";
import { nameOf, useApp } from "../lib/app";
import { shuffle } from "../lib/deck";
import { canSpeak, sfx, speak, speakAuto, stopSpeaking } from "../lib/sound";
import { load, save } from "../lib/store";
import type { HostQuestion } from "../shared/protocol";
import { Finish, MediaView, Turn, useKeys } from "./frame";

export interface Field {
  key: string;
  legend: string;
  options: { value: string | number; label: string; rule?: string }[];
  multi?: boolean;
  def: string | number | (string | number)[];
  /** Lets people type their own whole number. `multiple` makes it a multiple of the number of players. */
  custom?: { min: number; max: number; multiple?: boolean; unit: string };
}
export type SetupValues = Record<string, string | number | (string | number)[]>;

/** Round counts up to a multiple of the number of players so everyone gets the same number of turns. */
export function fitToPlayers(fields: Field[], n: number): Field[] {
  if (n < 2) return fields;
  const up = (x: unknown) => Math.ceil(Number(x) / n) * n;
  return fields.map((f) => {
    if (f.key !== "count") return f;
    const seen = new Set<number>();
    const options = f.options
      .map((o) => ({ ...o, value: up(o.value), label: String(up(o.value)) }))
      .filter((o) => !seen.has(o.value as number) && seen.add(o.value as number));
    return { ...f, options, def: up(f.def) };
  });
}

/** Why a typed number can't be used yet, or "" when it is fine. */
export function countProblem(text: string, c: NonNullable<Field["custom"]>, players: number): string {
  const t = text.trim();
  if (!t) return "";
  const n = Number(t);
  if (!/^\d+$/.test(t) || n < c.min || n > c.max) return `Type a whole number from ${c.min} to ${c.max}.`;
  if (c.multiple && players >= 2 && n % players) {
    const down = Math.floor(n / players) * players;
    const up = Math.ceil(n / players) * players;
    const pick = [down >= c.min ? down : 0, up <= c.max ? up : 0].filter(Boolean).join(" or ");
    return `With ${players} players, use a multiple of ${players} so everyone gets the same number of turns${pick ? `, like ${pick}` : ""}.`;
  }
  return "";
}

/** Setup screen: sensible defaults, remembered per game, one Start button. */
export function Setup({
  id,
  fields: rawFields,
  onStart,
  startLabel = "Start",
  note,
  error,
  disabled,
  players: playerCount,
}: {
  /** How many people share the turns. Defaults to the players added on this phone; rooms pass who has joined. */
  players?: number;
  disabled?: boolean;
  id: string;
  fields: Field[];
  onStart: (v: SetupValues) => void;
  startLabel?: string;
  note?: string;
  error?: string;
}) {
  const { players: local } = useApp();
  const n = playerCount ?? local.length;
  const fields = useMemo(() => fitToPlayers(rawFields, n), [rawFields, n]);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [v, setV] = useState<SetupValues>(() => {
    const saved = load<SetupValues>(`gn.setup.${id}`, {});
    const out: SetupValues = {};
    for (const f of fields) {
      const s = saved[f.key];
      const own = f.custom && typeof s === "number" && !countProblem(String(s), f.custom, n);
      const valid = Array.isArray(s)
        ? s.every((x) => f.options.some((o) => o.value === x))
        : f.options.some((o) => o.value === s) || !!own;
      out[f.key] = s !== undefined && valid ? s : f.def;
    }
    return out;
  });
  const empty = fields.some((f) => f.multi && (v[f.key] as unknown[]).length === 0);
  const problems = fields.map((f) => (f.custom ? countProblem(typed[f.key] ?? "", f.custom, n) : ""));
  const stuck = problems.some(Boolean);
  // Players joining or leaving a room changes what fits: round the chosen number up to the next multiple.
  useEffect(() => {
    if (n < 2) return;
    setV((p) => {
      let out = p;
      for (const f of fields) {
        const x = p[f.key];
        if (f.custom?.multiple && typeof x === "number" && x % n) {
          if (out === p) out = { ...p };
          out[f.key] = Math.ceil(x / n) * n;
        }
      }
      return out;
    });
  }, [n, fields]);
  // A saved number from a game with a different number of players may no longer fit.
  const oddSaved = fields.some(
    (f) => f.custom?.multiple && n >= 2 && typeof v[f.key] === "number" && (v[f.key] as number) % n !== 0,
  );
  return (
    <form
      className="setup stagger"
      onSubmit={(e) => {
        e.preventDefault();
        if (empty || stuck || oddSaved) return;
        save(`gn.setup.${id}`, v);
        onStart(v);
      }}
    >
      {fields.map((f, i) => (
        <div key={f.key} className="field">
          <Choice
            legend={f.legend}
            options={f.options}
            value={v[f.key] as never}
            multi={f.multi}
            onChange={(x) => {
              setTyped((p) => ({ ...p, [f.key]: "" }));
              setV((p) => ({ ...p, [f.key]: x as never }));
            }}
          />
          {f.custom && (
            <label className="own">
              <span>Or type your own</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder={`${f.custom.min}-${f.custom.max}`}
                value={typed[f.key] ?? ""}
                aria-invalid={!!problems[i]}
                aria-label={`${f.legend}: type your own number of ${f.custom.unit}`}
                onChange={(e) => {
                  const t = e.target.value.replace(/\D/g, "").slice(0, 3);
                  setTyped((p) => ({ ...p, [f.key]: t }));
                  if (f.custom && t && !countProblem(t, f.custom, n)) setV((p) => ({ ...p, [f.key]: Number(t) }));
                }}
              />
              <span>{f.custom.unit}</span>
            </label>
          )}
          {problems[i] && (
            <p className="error-text" role="alert">
              {problems[i]}
            </p>
          )}
        </div>
      ))}
      {note && <p className="hint">{note}</p>}
      {oddSaved && !stuck && (
        <p className="error-text" role="alert">
          Your saved number doesn&rsquo;t split between {n} players. Pick one above.
        </p>
      )}
      {(empty || error) && (
        <p className="error-text" role="alert">
          {empty ? "Pick at least one option above to start." : error}
        </p>
      )}
      <div className="dock">
        <button className="btn block" type="submit" disabled={empty || stuck || oddSaved || disabled}>
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
  const [streakNote, setStreakNote] = useState("");
  const [removed, setRemoved] = useState<number[]>([]);
  const streaks = useRef<Record<string, number>>({});
  const hinted = useRef<Set<string>>(new Set());
  const q = questions[i];
  const current = players[turn % players.length];
  const leader = Math.max(...players.map((p) => p.score));
  const canHint =
    picked == null &&
    !!q &&
    q.options.length >= 4 &&
    q.media?.type !== "pair" &&
    !hinted.current.has(current.id) &&
    leader - current.score >= 2;

  const choose = (idx: number) => {
    if (picked != null || !q || removed.includes(idx)) return;
    setPicked(idx);
    stopSpeaking();
    if (idx === q.correct) {
      const run = (streaks.current[current.id] ?? 0) + 1;
      streaks.current[current.id] = run;
      award(current.id, q.points);
      if (run >= 3) {
        award(current.id, 1);
        setStreakNote(`${run} in a row! +1 bonus.`);
        sfx("streak");
      } else {
        setStreakNote("");
        sfx("right");
      }
    } else {
      streaks.current[current.id] = 0;
      setStreakNote("");
      sfx("wrong");
    }
  };
  const useHint = () => {
    if (!q) return;
    hinted.current.add(current.id);
    const wrong = shuffle(q.options.map((_, k) => k).filter((k) => k !== q.correct)).slice(0, 2);
    setRemoved(wrong);
  };
  const next = () => {
    if (picked == null) return;
    setPicked(null);
    setRemoved([]);
    setStreakNote("");
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
  useEffect(() => {
    if (q && speakAuto()) speak(q.prompt + ". " + q.options.join(". "));
    return stopSpeaking;
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {canSpeak() && (
        <button
          className="link small"
          onClick={() => speak(q.prompt + ". " + q.options.join(". "))}
          aria-label="Read the question aloud"
        >
          Read aloud
        </button>
      )}
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
            aria-disabled={picked != null || removed.includes(idx)}
            hidden={removed.includes(idx)}
          >
            <kbd>{idx + 1}</kbd>
            <span>{o}</span>
          </button>
        ))}
      </div>
      {canHint && (
        <button className="btn ghost small" onClick={useHint}>
          Catch-up hint: remove two wrong answers
        </button>
      )}
      <div aria-live="polite" className="reveal-line">
        {picked != null && (
          <>
            <p className={clsx("verdict", right ? "good" : "bad")}>
              {right
                ? `Correct! +${q.points} for ${nameOf(current, turn % players.length)}. ${streakNote}`
                : "Not quite."}{" "}
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
