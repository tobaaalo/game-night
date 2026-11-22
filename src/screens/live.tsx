import { useEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import type { ClientMsg, RoomState } from "../shared/protocol";
import type { LiveView } from "../shared/live";

type Props = { state: RoomState; me: string; send: (m: ClientMsg) => void; skew: number };

function Clock({ deadline, skew }: { deadline?: number; skew: number }) {
  const [now, setNow] = useState(Date.now() + skew);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew), 250);
    return () => clearInterval(t);
  }, [skew]);
  if (!deadline) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span className={clsx("room-clock", left <= 5 && "low")} role="timer" aria-label={`${left} seconds left`}>
      {left}
    </span>
  );
}

/** One shared drawing. The drawer's phone paints what it draws at once; everyone else paints what the server holds. */
function Board({
  strokes,
  canDraw,
  onStroke,
  onUndo,
  onClear,
}: {
  strokes: number[][];
  canDraw: boolean;
  onStroke: (s: number[]) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const local = useRef<number[][]>(strokes.map((x) => [...x]));
  const cur = useRef<number[] | null>(null);
  const paint = () => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.fillStyle = "#fffdf6";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#1c0610";
    g.lineWidth = 6;
    g.lineCap = "round";
    g.lineJoin = "round";
    const all = canDraw ? [...local.current, ...(cur.current ? [cur.current] : [])] : strokes;
    for (const s of all) {
      g.beginPath();
      for (let i = 0; i + 1 < s.length; i += 2) {
        const x = (s[i] / 1000) * c.width;
        const y = (s[i + 1] / 1000) * c.height;
        if (i === 0) {
          g.moveTo(x, y);
          if (s.length === 2) g.lineTo(x + 0.1, y);
        } else g.lineTo(x, y);
      }
      g.stroke();
    }
  };
  useEffect(paint);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const cl = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
    return [cl(((e.clientX - r.left) / r.width) * 1000), cl(((e.clientY - r.top) / r.height) * 1000)];
  };
  const flush = (keepLast: boolean) => {
    const s = cur.current;
    if (!s || s.length < 2) return;
    local.current.push(s);
    onStroke(s);
    cur.current = keepLast ? s.slice(-2) : null;
  };
  return (
    <div className="sketch-wrap">
      <canvas
        ref={ref}
        className="sketch"
        width={800}
        height={600}
        aria-label={canDraw ? "Drawing area" : "The drawing"}
        onPointerDown={(e) => {
          if (!canDraw) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          cur.current = pos(e);
          paint();
        }}
        onPointerMove={(e) => {
          if (!canDraw || !cur.current) return;
          cur.current.push(...pos(e));
          if (cur.current.length >= 24) flush(true);
          paint();
        }}
        onPointerUp={() => {
          if (!canDraw) return;
          flush(false);
          paint();
        }}
        onPointerCancel={() => {
          flush(false);
          paint();
        }}
      />
      {canDraw && (
        <div className="actions center">
          <button
            className="btn ghost small"
            onClick={() => {
              local.current.pop();
              onUndo();
              paint();
            }}
          >
            Undo
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              local.current = [];
              onClear();
              paint();
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function Results({
  v,
  nm,
  judge,
  flag,
  me,
}: {
  v: LiveView;
  nm: (p: string) => string;
  judge?: (pid: string) => void;
  flag?: (pid: string, i: number) => void;
  me?: string;
}) {
  if (!v.results) return null;
  const sorted = [...v.results].sort((a, b) => b.total - a.total);
  return (
    <ul className="live-results">
      {sorted.map((r) => (
        <li key={r.pid}>
          <p className="live-who">
            <strong>{nm(r.pid)}</strong> <span className="mono">+{r.total}</span>
          </p>
          {v.kind === "knowme" ? (
            <p className={clsx("live-answer", r.ok && "right")}>
              {r.items[0]?.t || <em>no guess</em>}
              {judge && (
                <button className="link" onClick={() => judge(r.pid)}>
                  {r.ok ? "Mark wrong" : "Mark right"}
                </button>
              )}
            </p>
          ) : (
            <p className="live-answers">
              {r.items.map((it, i) => (
                <span key={i} className={clsx("chip", it.bad && "bad", it.p > 0 && "good")}>
                  {it.t || "·"}
                  {it.p > 0 && <b> +{it.p}</b>}
                  {flag && it.t && me && me !== r.pid && me !== "host" && (
                    <button
                      className="chip-flag"
                      aria-label={`Say ${it.t} is not valid`}
                      onClick={() => flag(r.pid, i)}
                    >
                      {it.bad ? "Removed" : "Not valid"}
                    </button>
                  )}
                </span>
              ))}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function WordsInput({ v, send, locked }: { v: LiveView; send: Props["send"]; locked: boolean }) {
  const labels = v.labels ?? [];
  const [vals, setVals] = useState<string[]>(() => labels.map(() => ""));
  const timer = useRef(0);
  const push = (next: string[]) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => send({ t: "live", a: "submit", v: next }), 350);
  };
  // Send what is typed just before time runs out, so nothing is lost.
  const latest = useRef(vals);
  latest.current = vals;
  useEffect(() => {
    if (!v.deadline) return;
    const wait = Math.max(0, v.deadline - Date.now() - 1500);
    const t = setTimeout(() => send({ t: "live", a: "submit", v: latest.current }), wait);
    return () => clearTimeout(t);
  }, [v.deadline, send]);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        send({ t: "live", a: "submit", v: vals });
        send({ t: "live", a: "lock" });
      }}
    >
      {labels.map((lb, i) => (
        <label className="field" key={i}>
          <span className="hint">{lb}</span>
          <input
            className="input"
            value={vals[i]}
            disabled={locked}
            autoComplete="off"
            autoCapitalize="words"
            placeholder={v.letter ? `Starts with ${v.letter}` : ""}
            onChange={(e) => {
              const n = [...vals];
              n[i] = e.target.value;
              setVals(n);
              push(n);
            }}
          />
        </label>
      ))}
      <button className="btn block" type="submit" disabled={locked}>
        {locked ? "Locked in. Waiting for the others" : "Lock in my answers"}
      </button>
    </form>
  );
}

export function LiveGame({ state, me, send, skew }: Props) {
  const v = state.live;
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [picking, setPicking] = useState(false);
  if (!v) return null;
  const nm = (p?: string) => state.players.find((x) => x.pid === p)?.name ?? "Someone";
  const isHost = me === "host";
  const isActor = me === v.actor;
  const others = state.players.filter((p) => p.pid !== v.actor);
  const mineLocked = v.submitted.includes(me);
  const head = (
    <div className="qmeta">
      <p className="prog">
        {v.kind === "chain" || v.kind === "memory" ? "Live" : `${Math.min(v.round + 1, v.rounds)} / ${v.rounds}`}
      </p>
      {v.step !== "reveal" && <Clock deadline={v.deadline} skew={skew} />}
    </div>
  );
  const next = (isHost || isActor || (v.kind !== "knowme" && !isHost)) && v.step === "reveal" && (
    <div className="actions center">
      <button className="btn ghost small" onClick={() => send({ t: "live", a: "next" })}>
        Next
      </button>
    </div>
  );

  /* ---------- Charades Sprint, Don't Say It, Charades Bingo ---------- */
  if (v.kind === "perform")
    return (
      <div className="qcard live">
        {head}
        <p className="turn">{isActor ? "Your turn" : `${nm(v.actor)} is performing`}</p>
        {v.step === "reveal" ? (
          <>
            <h2 className="qprompt">{v.note}</h2>
            {next}
          </>
        ) : isActor ? (
          <>
            <div className="taboo">
              <p>{v.secret}</p>
              {v.banned && v.banned.length > 0 && (
                <ul aria-label="Banned words">
                  {v.banned.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
            {picking ? (
              <div className="stack">
                <p className="hint">Who got it?</p>
                <div className="actions center">
                  {others.map((p) => (
                    <button
                      key={p.pid}
                      className="btn"
                      onClick={() => {
                        send({ t: "live", a: "got", pid: p.pid });
                        setPicking(false);
                        navigator.vibrate?.(30);
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                  <button className="btn ghost" onClick={() => setPicking(false)}>
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="actions center">
                <button className="btn" onClick={() => setPicking(true)}>
                  Got it
                </button>
                <button className="btn ghost" onClick={() => send({ t: "live", a: "skip" })}>
                  Skip
                </button>
                <button className="link" onClick={() => send({ t: "live", a: "done" })}>
                  End my turn
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="qprompt">{isHost ? "Guess out loud." : "Shout your guesses!"}</h2>
            <p className="muted">Guessed this turn: {v.tally}</p>
            {v.note && <p className="verdict">{v.note}</p>}
            {v.buzz && !isHost && (
              <button className="btn block" onClick={() => send({ t: "live", a: "buzz" })}>
                Buzz! They said a banned word
              </button>
            )}
          </>
        )}
      </div>
    );

  /* ---------- Name Place Animal Thing, Name 5 ---------- */
  if (v.kind === "words")
    return (
      <div className="qcard live">
        {head}
        {v.letter && (
          <div className="letter" aria-label={`Letter ${v.letter}`}>
            {v.letter}
          </div>
        )}
        <h2 className="qprompt">{v.prompt}</h2>
        {v.step === "reveal" ? (
          <>
            <Results v={v} nm={nm} me={me} flag={(pid, i) => send({ t: "live", a: "flag", pid, i })} />
            <p className="muted small">
              Tap "Not valid" on any answer that does not fit. Most players agreeing removes it.
            </p>
            {next}
          </>
        ) : isHost ? (
          <p className="muted">
            Locked in: {v.submitted.length} of {state.players.length}. Unique answers score more than shared ones.
          </p>
        ) : (
          <WordsInput key={v.round} v={v} send={send} locked={mineLocked} />
        )}
      </div>
    );

  /* ---------- Name it out loud, others keep count ---------- */
  if (v.kind === "shout")
    return (
      <div className="qcard live">
        {head}
        <p className="turn">{isActor ? "Your turn: shout them out" : `${nm(v.actor)} is shouting`}</p>
        <h2 className="qprompt">{v.prompt}</h2>
        <p className="shout-tally" aria-live="polite">
          <span className="mono">{v.tally ?? 0}</span> / {v.wordLen}
        </p>
        {v.step === "reveal" ? (
          <>
            <p className="muted">{v.note}</p>
            {next}
          </>
        ) : isActor ? (
          <div className="actions center">
            <button className="btn big" onClick={() => send({ t: "live", a: "tick" })}>
              That is one
            </button>
            <button className="btn ghost small" onClick={() => send({ t: "live", a: "done" })}>
              Done
            </button>
          </div>
        ) : (
          <div className="actions center">
            <button className="btn ghost" onClick={() => send({ t: "live", a: "veto" })}>
              Not valid, take one off
            </button>
          </div>
        )}
      </div>
    );

  /* ---------- Draw and Guess ---------- */
  if (v.kind === "draw")
    return (
      <div className="qcard live">
        {head}
        <p className="turn">{isActor ? "You are drawing" : `${nm(v.actor)} is drawing`}</p>
        {isActor && v.step === "play" && <h2 className="qprompt">Draw: {v.secret}</h2>}
        {!isActor && v.step === "play" && <p className="muted">{`${v.wordLen} letters`}</p>}
        {v.step === "reveal" && <h2 className="qprompt">{v.note}</h2>}
        <Board
          key={v.round}
          strokes={v.strokes ?? []}
          canDraw={isActor && v.step === "play"}
          onStroke={(s) => send({ t: "live", a: "stroke", s })}
          onUndo={() => send({ t: "live", a: "undo" })}
          onClear={() => send({ t: "live", a: "clear" })}
        />
        {!isActor && !isHost && v.step === "play" && !v.guesses?.some((g) => g.ok && g.pid === me) && (
          <form
            className="row-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              send({ t: "live", a: "guess", v: text });
              setText("");
            }}
          >
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your guess"
              autoComplete="off"
              autoCapitalize="none"
            />
            <button className="btn" type="submit">
              Guess
            </button>
          </form>
        )}
        {v.guesses?.some((g) => g.ok && g.pid === me) && <p className="verdict good">You got it!</p>}
        <ul className="guess-feed" aria-label="Guesses">
          {[...(v.guesses ?? [])]
            .reverse()
            .slice(0, 8)
            .map((g, i) => (
              <li key={i} className={clsx(g.ok && "right")}>
                <strong>{nm(g.pid)}</strong> {g.ok ? "guessed it!" : g.text}
              </li>
            ))}
        </ul>
        {next}
      </div>
    );

  /* ---------- Word Chain ---------- */
  if (v.kind === "chain") {
    const last = v.chain?.[v.chain.length - 1] ?? "";
    const need = last.slice(-1).toUpperCase();
    return (
      <div className="qcard live">
        {head}
        <p className="turn">{isActor ? "Your word" : `${nm(v.actor)}'s turn`}</p>
        <p className="chain-trail">
          {(v.chain ?? []).map((w, i) => (
            <span key={i} className="chip">
              {w}
            </span>
          ))}
        </p>
        <h2 className="qprompt">
          Next word starts with <span className="letter inline">{need}</span>
        </h2>
        {isActor && (
          <form
            className="row-form"
            onSubmit={(e) => {
              e.preventDefault();
              const w = text.trim().toLowerCase();
              if (!/^[a-z]+$/.test(w)) return setErr("Letters only, please.");
              if (w.length < 5) return setErr("Words need at least 5 letters.");
              if (w[0] !== need.toLowerCase()) return setErr(`It must start with ${need}.`);
              if (v.chain?.includes(w)) return setErr("That word has been used.");
              setErr("");
              send({ t: "live", a: "word", v: w });
              setText("");
            }}
          >
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`A word starting with ${need}`}
              autoComplete="off"
              autoCapitalize="none"
              autoFocus
            />
            <button className="btn" type="submit">
              Lock it in
            </button>
          </form>
        )}
        <p className="hint">Words must be at least 5 letters long.</p>
        {err && isActor && <p className="error-text">{err}</p>}
        {v.out && v.out.length > 0 && <p className="muted">Out: {v.out.map((p) => nm(p)).join(", ")}</p>}
      </div>
    );
  }

  /* ---------- Memory Match ---------- */
  if (v.kind === "memory") {
    const cards = v.board?.cards ?? [];
    return (
      <div className="qcard live">
        {head}
        <p className="turn">{isActor ? "Your turn. Flip two cards." : `${nm(v.actor)} is flipping`}</p>
        <div className="mem-grid" style={{ "--c": cards.length > 16 ? 6 : 4 } as CSSProperties}>
          {cards.map((c, i) => (
            <button
              key={i}
              className={clsx("mem-card", c != null && "up", v.board?.done.includes(i) && "done")}
              disabled={!isActor || c != null || v.step !== "play"}
              aria-label={c ?? `Card ${i + 1}`}
              onClick={() => send({ t: "live", a: "flip", i })}
            >
              {c ?? "?"}
            </button>
          ))}
        </div>
        <p className="muted">Pairs: {state.players.map((p) => `${p.name} ${v.pairs?.[p.pid] ?? 0}`).join(" · ")}</p>
      </div>
    );
  }

  /* ---------- How Well Do You Know Me ---------- */
  return (
    <div className="qcard live">
      {head}
      <p className="turn">{isActor ? "You are in the hot seat" : `${nm(v.actor)} is in the hot seat`}</p>
      <h2 className="qprompt">{v.prompt}</h2>
      {v.step === "secret" &&
        (isActor ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              send({ t: "live", a: "secret", v: text });
              setText("");
            }}
          >
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Your real answer. Nobody sees it yet."
              autoComplete="off"
              autoFocus
            />
            <button className="btn block" type="submit">
              Lock in my answer
            </button>
          </form>
        ) : (
          <p className="muted">Waiting for {nm(v.actor)} to answer in secret…</p>
        ))}
      {v.step === "guess" &&
        (isActor || isHost ? (
          <p className="muted">
            Guesses in: {v.submitted.length} of {Math.max(0, state.players.length - 1)}
          </p>
        ) : mineLocked ? (
          <p className="muted">Guess locked in. Waiting for the others…</p>
        ) : (
          <form
            className="row-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              send({ t: "live", a: "submit", v: text });
              setText("");
            }}
          >
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`What did ${nm(v.actor)} say?`}
              autoComplete="off"
              autoFocus
            />
            <button className="btn" type="submit">
              Guess
            </button>
          </form>
        ))}
      {v.step === "reveal" && (
        <>
          <p className="verdict good">{v.word ? `${nm(v.actor)} said: ${v.word}` : v.note}</p>
          <Results v={v} nm={nm} judge={isActor ? (pid) => send({ t: "live", a: "judge", pid }) : undefined} />
          {isActor && <p className="hint">Tap to fix any guess that was marked wrongly.</p>}
          {next}
        </>
      )}
    </div>
  );
}
