import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { nameOf, useApp, type Player } from "../lib/app";
import { botFirst } from "../lib/bot";

/* ---------- Icons (inline, 24px grid, stroke) ---------- */
const P = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
export const Icon = {
  back: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  chevron: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  menu: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  help: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14M12 17.5v.01" />
    </svg>
  ),
  close: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  plus: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  people: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16.5 14c2.4.2 4 1.8 4.5 4.5" />
    </svg>
  ),
  phones: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>
      <rect x="3" y="5" width="8" height="14" rx="1.6" />
      <rect x="13" y="3" width="8" height="14" rx="1.6" />
      <path d="M7 16h0M17 14h0" />
    </svg>
  ),
  shuffle: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>
      <path d="M3 7h3c4 0 6 10 10 10h5M17 14l4 3-4 3M3 17h3c1.5 0 2.7-1.2 3.7-2.8M14.3 9.8C15 8.4 16 7 17 7h4M17 4l4 3-4 3" />
    </svg>
  ),
  trash: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  ),
};

/* ---------- Choice chips (radio or checkbox group) ---------- */
interface ChoiceProps<T extends string | number> {
  legend: string;
  options: { value: T; label: string; rule?: string }[];
  value: T | T[];
  onChange: (v: T | T[]) => void;
  multi?: boolean;
}
export function Choice<T extends string | number>({ legend, options, value, onChange, multi }: ChoiceProps<T>) {
  const name = useId();
  const arr = Array.isArray(value) ? value : [value];
  const all = !!multi && arr.length === options.length;
  return (
    <fieldset className="choice">
      <legend>{legend}</legend>
      <div className="chips">
        {multi && (
          <label className="chip">
            <input type="checkbox" checked={all} onChange={() => onChange(options.map((o) => o.value))} />
            All
          </label>
        )}
        {options.map((o) => (
          <label className="chip" key={String(o.value)}>
            <input
              type={multi ? "checkbox" : "radio"}
              name={name}
              checked={multi && all ? false : arr.includes(o.value)}
              onChange={() => {
                if (!multi) return onChange(o.value);
                if (all) return onChange([o.value]);
                onChange(arr.includes(o.value) ? arr.filter((x) => x !== o.value) : [...arr, o.value]);
              }}
            />
            {o.label}
          </label>
        ))}
      </div>
      {!multi && options.find((o) => o.value === value)?.rule && (
        <p className="level-rule" aria-live="polite">
          {options.find((o) => o.value === value)?.rule}
        </p>
      )}
    </fieldset>
  );
}

/* ---------- Split-flap number ---------- */
export function Flaps({ value, min = 2 }: { value: number; min?: number }) {
  const str = String(value).padStart(min, "0");
  const [shown, setShown] = useState(str);
  const [flipping, setFlipping] = useState<boolean[]>([]);
  useEffect(() => {
    if (str === shown) return;
    const prev = shown.padStart(str.length, "0");
    setFlipping(str.split("").map((d, i) => prev[i] !== d));
    setShown(str);
    const t = setTimeout(() => setFlipping([]), 400);
    return () => clearTimeout(t);
  }, [str, shown]);
  return (
    <span className="flaps" aria-hidden="true">
      {str.split("").map((d, i) => (
        <span key={i} className={clsx("flap", flipping[i] && "flip")}>
          <span className="face">{d}</span>
        </span>
      ))}
    </span>
  );
}

export function Scoreboard({ players, now, compact }: { players: Player[]; now?: string; compact?: boolean }) {
  return (
    <div className="board" role="list" aria-label="Scores">
      {players.map((p, i) => (
        <div
          role="listitem"
          key={p.id}
          className={clsx("board-seat", now === p.id && "now")}
          aria-label={`${nameOf(p, i)}: ${p.score} points`}
        >
          <span className="nm">{nameOf(p, i)}</span>
          <Flaps value={p.score} min={compact ? 1 : 2} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Sheet (accessible dialog) ---------- */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, a, input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("button, a, input, select, textarea")].filter(
          (x) => !x.hasAttribute("disabled"),
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    // Clicking the dimmed backdrop closes the sheet; keyboard users have Esc and the Close button.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="actions" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <h2 className="h2" id={id}>
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Toasts ---------- */
export function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <p>{t.text}</p>
          {t.undo && (
            <button
              onClick={() => {
                t.undo?.();
                dismiss(t.id);
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Countdown ---------- */
export function useCountdown(seconds: number, running: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(seconds);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => setLeft(seconds), [seconds]);
  useEffect(() => {
    if (!running) return;
    // Every run starts from the full time. (It used to start from whatever was left last turn, so the
    // second player got only a few seconds.)
    const started = Date.now();
    const startLeft = seconds;
    setLeft(seconds);
    const t = setInterval(() => {
      const l = Math.max(0, startLeft - Math.floor((Date.now() - started) / 1000));
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        endRef.current();
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return [left, setLeft] as const;
}

export function TimerDial({ left, total }: { left: number; total: number }) {
  const pct = total ? left / total : 0;
  return (
    <div
      className={clsx("dial", left <= 5 && "low")}
      role="timer"
      aria-live={left <= 5 ? "assertive" : "off"}
      aria-label={`${left} seconds left`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="44" className="dial-track" />
        <circle cx="50" cy="50" r="44" className="dial-fill" style={{ strokeDashoffset: 276.5 * (1 - pct) }} />
      </svg>
      <span>{left}</span>
    </div>
  );
}

/* ---------- Who got it? ---------- */
export function WhoGotIt({
  label,
  points,
  onDone,
  multi = false,
  exclude,
}: {
  label: string;
  points: number;
  onDone: (ids: string[]) => void;
  multi?: boolean;
  exclude?: string;
}) {
  const { players } = useApp();
  const [sel, setSel] = useState<string[]>([]);
  // The computer is only offered when it beat you to the answer. How often depends on how good it is.
  const bot = players.find((p) => p.bot);
  const [botGot] = useState(() => (bot ? botFirst(bot.skill) : false));
  const list = players.filter((p) => p.id !== exclude && (!p.bot || botGot));
  return (
    <div className="whogot">
      <p className="h3">{label}</p>
      {bot && (
        <p className="hint">{botGot ? `${bot.name} says it knew that one.` : `${bot.name} didn't get that one.`}</p>
      )}
      <div className="givers" role="group" aria-label={label}>
        {list.map((p) => {
          const i = players.indexOf(p);
          const on = sel.includes(p.id);
          return multi ? (
            <button
              key={p.id}
              className={clsx("giver", on && "on")}
              aria-pressed={on}
              onClick={() => setSel((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
            >
              {nameOf(p, i)} <span className="pts">+{points}</span>
            </button>
          ) : (
            <button key={p.id} className="giver" onClick={() => onDone([p.id])}>
              {nameOf(p, i)} <span className="pts">+{points}</span>
            </button>
          );
        })}
      </div>
      {multi && sel.length > 0 ? (
        <button className="btn" onClick={() => onDone(sel)}>
          Give the points
        </button>
      ) : (
        <button className="link" onClick={() => onDone([])}>
          Nobody got it, next
        </button>
      )}
    </div>
  );
}

/** A question prompt where anything in “quotes” (a Bible verse, a quote) shows in gold so it stands out from the question. */
export function PromptText({ text }: { text: string }) {
  const parts = text.split(/(“[^”]*”)/);
  return (
    <span className="ptext">
      {parts.map((p, i) =>
        p.startsWith("“") && p.endsWith("”") ? (
          <span className="quote" key={i}>
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </span>
  );
}
