import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { TimerDial, WhoGotIt, useCountdown } from "../components/ui";
import { nameOf, useApp } from "../lib/app";
import { draw, startIndex } from "../lib/deck";
import { Finish, Img, Turn, useKeys } from "./frame";
import { keep } from "../lib/scrapbook";

/* ---------- Reveal rounds: show a prompt, reveal, award whoever got it first ---------- */
export interface RevealItem {
  prompt: ReactNode;
  answer: string;
  points: number;
  label?: string;
  big?: boolean;
  image?: { src: string; alt: string };
  hint?: string;
}
export function RevealRun({ items, onAgain }: { items: RevealItem[]; onAgain: () => void }) {
  const { award } = useApp();
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [hint, setHint] = useState(false);
  const it = items[i];
  const pts = it ? Math.max(1, it.points - (hint ? 1 : 0)) : 0;
  useKeys(
    (k, e) => {
      if (!shown && (k === " " || k === "Enter")) {
        e.preventDefault();
        setShown(true);
      }
    },
    [shown],
  );
  if (!it) return <Finish onAgain={onAgain} />;
  const next = (ids: string[]) => {
    ids.forEach((id) => award(id, pts));
    setShown(false);
    setHint(false);
    setI((x) => x + 1);
  };
  return (
    <div className="qcard" key={i}>
      <div className="qmeta">
        <p className="prog">
          {i + 1} / {items.length}
          {it.label ? ` · ${it.label}` : ""} · {pts} {pts === 1 ? "pt" : "pts"}
        </p>
      </div>
      {it.image ? (
        <div className="frame portrait">
          <Img src={it.image.src} alt={shown ? it.answer : it.image.alt} />
        </div>
      ) : (
        <h2 className={clsx("qprompt", it.big && "emoji")}>{it.prompt}</h2>
      )}
      {it.image && <h2 className="qprompt">{it.prompt}</h2>}
      <div className={clsx("flipcard", shown && "flipped")} aria-live="polite">
        <div className="flip-inner">
          <div className="flip-front">
            {hint && it.hint ? <span className="hinttext">Hint: {it.hint}</span> : <span aria-hidden="true">?</span>}
          </div>
          <div className="flip-back">{shown ? it.answer : ""}</div>
        </div>
      </div>
      {!shown ? (
        <div className="actions center">
          <button className="btn" onClick={() => setShown(true)} autoFocus>
            Reveal the answer
          </button>
          {it.hint && !hint && it.points > 1 && (
            <button className="btn ghost" onClick={() => setHint(true)}>
              Show a hint (−1 point)
            </button>
          )}
        </div>
      ) : (
        <WhoGotIt label="Who got it first?" points={pts} onDone={next} />
      )}
    </div>
  );
}

/* ---------- Card decks: endless, no repeats within 5 ---------- */
export function CardDeck({
  id,
  items,
  format = (s) => s,
  total,
  onAgain,
}: {
  id: string;
  items: string[];
  format?: (s: string) => string;
  total?: number;
  onAgain?: () => void;
}) {
  const [hist, setHist] = useState<string[]>(() => [draw(id, items)]);
  const [pos, setPos] = useState(0);
  const next = () => {
    if (pos + 1 >= hist.length) setHist((h) => [...h, draw(id, items)]);
    setPos((p) => p + 1);
  };
  useKeys(
    (k, e) => {
      if (k === " " || k === "Enter" || k === "ArrowRight") {
        e.preventDefault();
        next();
      }
      if (k === "ArrowLeft" && pos > 0) setPos((p) => p - 1);
    },
    [pos, hist],
  );
  if (total && onAgain && pos >= total)
    return (
      <div className="qcard stack center-text">
        <p className="h3">That&rsquo;s all {total} cards.</p>
        <Finish onAgain={onAgain} />
      </div>
    );
  return (
    <div className="qcard deck">
      <p className="prog">{total ? `Card ${pos + 1} of ${total}` : `Card ${pos + 1}`}</p>
      <div className="deckcard" key={pos}>
        <p>{format(hist[pos])}</p>
      </div>
      <div className="actions center">
        {pos > 0 && (
          <button className="btn ghost" onClick={() => setPos((p) => p - 1)}>
            Previous
          </button>
        )}
        <button className="btn" onClick={next} autoFocus>
          {total && pos + 1 >= total ? "Finish" : "Next card"}
        </button>
      </div>
      <p className="hint center-text">
        Cards don&rsquo;t repeat within five, and the pile reshuffles when it runs out.
      </p>
    </div>
  );
}

/* ---------- How Well Do You Know Me? ---------- */
export function KnowMe({ questions }: { questions: string[] }) {
  const { players, award, go, toast } = useApp();
  const [seat, setSeat] = useState(() => startIndex(players.length));
  const [kept, setKept] = useState(false);
  const [round, setRound] = useState(1);
  const [step, setStep] = useState<"type" | "guess" | "reveal">("type");
  const [ans, setAns] = useState("");
  const [peek, setPeek] = useState(false);
  const hot = players[seat % players.length];
  const name = nameOf(hot, seat % players.length);
  const q = useMemo(() => draw("knowme", questions).replace(/\{n\}/g, name), [round]); // eslint-disable-line react-hooks/exhaustive-deps
  if (players.length < 2)
    return (
      <div className="empty">
        <p className="h3">This one needs at least two players.</p>
        <button className="btn" onClick={() => go("/names")}>
          Add players
        </button>
      </div>
    );
  const nextRound = (ids: string[]) => {
    ids.forEach((id) => award(id, 1));
    setAns("");
    setStep("type");
    setPeek(false);
    setKept(false);
    setSeat((s) => (s + 1) % players.length);
    setRound((r) => r + 1);
  };
  return (
    <div className="qcard">
      <div className="qmeta">
        <p className="turn">{name} is in the hot seat</p>
        <p className="prog">Round {round}</p>
      </div>
      <h2 className="qprompt">{q}</h2>
      {step === "type" && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setStep("guess");
          }}
        >
          <label className="field">
            <span className="hint">{name}: type your real answer secretly, then pass the phone.</span>
            <input
              className="input secret"
              type={peek ? "text" : "password"}
              value={ans}
              onChange={(e) => setAns(e.target.value)}
              placeholder="Your secret answer"
              autoComplete="off"
              autoFocus
            />
          </label>
          <div className="actions center">
            <button type="button" className="link" onClick={() => setPeek((p) => !p)}>
              {peek ? "Hide what I typed" : "Show what I typed"}
            </button>
            <button className="btn" type="submit">
              {ans.trim() ? "Lock it in" : "Pass the phone"}
            </button>
          </div>
        </form>
      )}
      {step === "guess" && (
        <div className="stack">
          <p className="lede center-text">Everyone else: say your guess out loud now.</p>
          <div className="actions center">
            <button className="btn" onClick={() => setStep("reveal")} autoFocus>
              Reveal {name}&rsquo;s answer
            </button>
          </div>
        </div>
      )}
      {step === "reveal" && (
        <div className="stack">
          <div className="flipcard flipped">
            <div className="flip-inner">
              <div className="flip-front" />
              <div className="flip-back">{ans.trim() || `${name}, say it out loud!`}</div>
            </div>
          </div>
          {ans.trim() && (
            <div className="actions center">
              <button
                className="btn ghost small"
                disabled={kept}
                onClick={() => {
                  keep({ q, a: ans.trim(), who: name });
                  setKept(true);
                  toast("Saved to your keepsakes.");
                }}
              >
                {kept ? "Kept ✓" : "Keep this moment"}
              </button>
            </div>
          )}
          <WhoGotIt label="Who guessed right?" points={1} multi exclude={hot.id} onDone={nextRound} />
        </div>
      )}
    </div>
  );
}

/* ---------- Timed turns: charades, don't say it, name 5 ---------- */
export function TimedRun<T>({
  id,
  items,
  seconds,
  render,
  oneShot,
  pointsOf = () => 1,
  intro,
  total,
  onAgain,
}: {
  /** Turns in the whole game, shared equally between the players. */
  total?: number;
  onAgain?: () => void;
  id: string;
  items: T[];
  seconds: number;
  render: (item: T) => ReactNode;
  oneShot?: boolean;
  pointsOf?: (item: T) => number;
  intro: string;
}) {
  const { players, award } = useApp();
  const [turn, setTurn] = useState(() => startIndex(players.length));
  const [phase, setPhase] = useState<"ready" | "go" | "done">("ready");
  const [item, setItem] = useState<T | null>(null);
  const [got, setGot] = useState(0);
  const cur = players[turn % players.length];
  const [left] = useCountdown(seconds, phase === "go", () => setPhase("done"));
  const start = () => {
    setGot(0);
    setItem(draw(id, items));
    setPhase("go");
  };
  const hit = () => {
    if (!item) return;
    const p = pointsOf(item);
    award(cur.id, p);
    setGot((g) => g + p);
    if (oneShot) setPhase("done");
    else setItem(draw(id, items));
  };
  const skip = () => {
    if (oneShot) setPhase("done");
    else setItem(draw(id, items));
  };
  const [taken, setTaken] = useState(0);
  const nextPlayer = () => {
    setTaken((x) => x + 1);
    setTurn((t) => (t + 1) % players.length);
    setPhase("ready");
  };
  useKeys(
    (k, e) => {
      if (k === " " || k === "Enter") {
        e.preventDefault();
        if (phase === "ready") start();
        else if (phase === "go") hit();
        else nextPlayer();
      }
      if (phase === "go" && (k === "s" || k === "ArrowRight")) skip();
    },
    [phase, item, turn],
  );
  if (total && onAgain && taken >= total)
    return (
      <div className="qcard stack center-text">
        <p className="h3">That&rsquo;s all {total} turns.</p>
        <Finish onAgain={onAgain} />
      </div>
    );
  return (
    <div className="qcard">
      <div className="qmeta">
        <Turn id={cur.id} />
        {phase === "go" && <TimerDial left={left} total={seconds} />}
      </div>
      {phase === "ready" && (
        <div className="stack center-text">
          <h2 className="qprompt">Get ready, {nameOf(cur, turn % players.length)}</h2>
          <p className="lede center-text">{intro}</p>
          <div className="actions center">
            <button className="btn" onClick={start} autoFocus>
              Start {seconds} seconds
            </button>
          </div>
        </div>
      )}
      {phase === "go" && item != null && (
        <div className="stack">
          <div className="deckcard hot">{render(item)}</div>
          <div className="actions center">
            <button className="btn right" onClick={hit}>
              {oneShot ? `Did it! +${pointsOf(item)}` : "Got it! +1"}
            </button>
            <button className="btn ghost" onClick={skip}>
              {oneShot ? "Didn't make it" : "Skip"}
            </button>
          </div>
        </div>
      )}
      {phase === "done" && (
        <div className="stack center-text">
          <h2 className="qprompt">{left === 0 ? "Time!" : "Done!"}</h2>
          <p className="lede center-text">
            {nameOf(cur, turn % players.length)} scored {got} {got === 1 ? "point" : "points"} this turn.
          </p>
          <div className="actions center">
            <button className="btn" onClick={nextPlayer} autoFocus>
              {total && taken + 1 >= total ? "Finish" : "Next player"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Name, Place, Animal, Thing ---------- */
const LETTERS = "ABCDEFGHIJKLMNOPRSTW";
export function NPAT() {
  const [letter, setLetter] = useState(() => LETTERS[Math.floor(Math.random() * LETTERS.length)]);
  const [phase, setPhase] = useState<"ready" | "go" | "score">("ready");
  const [left] = useCountdown(60, phase === "go", () => setPhase("score"));
  const { award } = useApp();
  const roll = useRef(0);
  const newLetter = () => {
    roll.current++;
    setLetter((l) => {
      let n = l;
      while (n === l) n = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      return n;
    });
    setPhase("ready");
  };
  useEffect(() => {
    if (phase === "score") navigator.vibrate?.(200);
  }, [phase]);
  return (
    <div className="qcard">
      <p className="prog">Name · Place · Animal · Thing · Food</p>
      <div className="letter" key={roll.current} aria-label={`Your letter is ${letter}`}>
        {letter}
      </div>
      {phase === "ready" && (
        <div className="actions center">
          <button className="btn" onClick={() => setPhase("go")} autoFocus>
            Start 60 seconds
          </button>
          <button className="btn ghost" onClick={newLetter}>
            Different letter
          </button>
        </div>
      )}
      {phase === "go" && (
        <div className="actions center">
          <TimerDial left={left} total={60} />
          <button className="btn ghost" onClick={() => setPhase("score")}>
            Pens down early
          </button>
        </div>
      )}
      {phase === "score" && (
        <>
          <p className="lede center-text">Pens down! Read your answers out. Unique answers score 10, shared ones 5.</p>
          <WhoGotIt
            label="Who had the best sheet?"
            points={10}
            onDone={(ids) => (ids.forEach((id) => award(id, 10)), newLetter())}
          />
        </>
      )}
    </div>
  );
}

export { Finish };
