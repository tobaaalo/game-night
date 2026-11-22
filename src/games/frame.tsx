import { useEffect, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import clsx from "clsx";
import { Icon, Scoreboard, Sheet } from "../components/ui";
import { nameOf, useApp } from "../lib/app";
import type { Media } from "../shared/protocol";

export function GameFrame({
  title,
  how,
  children,
  now,
  scores = true,
  live,
}: {
  title: string;
  how: string;
  children: ReactNode;
  now?: string;
  scores?: boolean;
  live?: boolean;
}) {
  const { back, players, resetScores, markStart, baseline } = useApp();
  // The scoreboard shows this game only, not the whole night.
  const gamePlayers = players.map((p) => ({ ...p, score: p.score - (baseline[p.id] ?? 0) }));
  const [help, setHelp] = useState(false);
  useEffect(() => markStart(), [markStart]);
  return (
    <div className="screen game-screen">
      <div className="game-head">
        <button className="icon-btn" onClick={() => back("/games")} aria-label="Back to games">
          <Icon.back />
        </button>
        <h1 className="h2 game-title" tabIndex={-1}>
          {title}
        </h1>
        <button className="icon-btn" onClick={() => setHelp(true)} aria-label="How to play">
          <Icon.help />
        </button>
      </div>
      <div className={clsx("stage marquee", live && "live")}>{children}</div>
      {scores && (
        <div className="game-foot">
          <Scoreboard players={gamePlayers} now={now} />
          <button className="link small" onClick={resetScores}>
            Reset scores
          </button>
        </div>
      )}
      {help && (
        <Sheet title="How to play" onClose={() => setHelp(false)}>
          <p className="lede" style={{ fontSize: "var(--step-1)" }}>
            {how}
          </p>
          <p className="hint">Keyboard: 1–4 picks an answer, Space or Enter goes next, Esc goes back.</p>
          <button className="btn block" onClick={() => setHelp(false)}>
            Got it
          </button>
        </Sheet>
      )}
    </div>
  );
}

export function Turn({ id }: { id: string }) {
  const { players } = useApp();
  const i = players.findIndex((p) => p.id === id);
  if (i < 0) return null;
  return <p className="turn">{nameOf(players[i], i)}&rsquo;s turn</p>;
}

/** Sizes big text from its longest word so a long name never runs off the screen. */
export const fitLen = (t: string) => {
  const words = String(t).split(/\s+/);
  const n = String(t).length;
  return {
    "--len": Math.max(4, ...words.map((w) => w.length)),
    "--k": n <= 18 ? 1 : n <= 36 ? 0.82 : n <= 60 ? 0.68 : 0.55,
  } as CSSProperties;
};

export function MediaView({
  media,
  revealed,
  captions,
  onPick,
  states,
}: {
  media?: Media;
  revealed?: boolean;
  captions?: string[];
  onPick?: (i: number) => void;
  states?: (string | false | undefined)[];
}) {
  if (!media) return null;
  switch (media.type) {
    case "image":
      return (
        <div className="frame portrait">
          <Img src={media.src} alt={media.alt} />
        </div>
      );
    case "flag":
      return (
        <div className="frame flagbox">
          <Img src={`/flags/${media.code}.svg`} alt="A mystery flag" />
        </div>
      );
    case "shape":
      return (
        <svg className="shape" viewBox="0 0 200 200" role="img" aria-label="Outline of a mystery country">
          <path d={media.d} />
        </svg>
      );
    case "big":
      return (
        <>
          {media.sub && <p className="bigsub">{media.sub}</p>}
          <p className="bigtext" style={fitLen(media.text)}>
            {media.text}
          </p>
        </>
      );
    case "pair":
      return (
        <div className={clsx("pair", revealed && "revealed")}>
          {(["a", "b"] as const).map((k, i) => {
            const side = media[k];
            const inner = (
              <>
                {side.src ? (
                  <Img src={side.src} alt={`Picture ${i ? "B" : "A"}`} square />
                ) : (
                  <blockquote>{side.text}</blockquote>
                )}
                <span className="pair-cap">
                  <kbd>{i + 1}</kbd> {i ? "B" : "A"}
                  {revealed && captions?.[i] && (
                    <span className={clsx("lbl", captions[i] === "AI" ? "ai" : "real")}>{captions[i]}</span>
                  )}
                </span>
              </>
            );
            return onPick ? (
              <button
                key={k}
                className={clsx("pair-side pickable", states?.[i])}
                onClick={() => onPick(i)}
                aria-disabled={revealed}
                aria-label={`Pick ${i ? "B" : "A"}`}
              >
                {inner}
              </button>
            ) : (
              <figure key={k} className={clsx("pair-side", states?.[i])}>
                {inner}
              </figure>
            );
          })}
        </div>
      );
  }
}

export function Img({ src, alt, square }: { src: string; alt: string; square?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    setState("loading");
    setTries(0);
  }, [src]);
  const onError = () => {
    // A slow or dropped connection often fixes itself: retry twice quietly before showing the message.
    if (tries < 2) {
      setTimeout(() => setTries((n) => n + 1), 700 * (tries + 1));
    } else setState("error");
  };
  const url = tries ? `${src}${src.includes("?") ? "&" : "?"}r=${tries}` : src;
  return (
    <span className={clsx("img", square && "square", state)}>
      {state !== "ok" && (
        <span className="img-state" aria-hidden={state === "loading"}>
          {state === "error" && (
            <span>
              Couldn&rsquo;t load this picture.
              <br />
              <button
                type="button"
                className="btn quiet"
                onClick={() => {
                  setState("loading");
                  setTries((n) => n + 1);
                }}
              >
                Try again
              </button>
            </span>
          )}
        </span>
      )}
      <img key={url} src={url} alt={alt} onLoad={() => setState("ok")} onError={onError} decoding="async" />
    </span>
  );
}

export function Finish({ onAgain, label = "Play again" }: { onAgain: () => void; label?: string }) {
  const { players, go, baseline, games, markStart, countGame } = useApp();
  useEffect(() => countGame(), [countGame]);
  const ranked = players
    .map((p, i) => ({ ...p, n: nameOf(p, i), game: p.score - (baseline[p.id] ?? 0) }))
    .sort((a, b) => b.game - a.game || b.score - a.score);
  const top = ranked[0];
  const tie = ranked.length > 1 && ranked[1].game === top.game;
  const played = Math.max(1, games);
  const teamed = players.length > 1 && players.every((p) => p.team);
  const teamRows = [1, 2].map((t) => ({
    t,
    game: ranked.filter((p) => p.team === t).reduce((a, p) => a + p.game, 0),
    total: ranked.filter((p) => p.team === t).reduce((a, p) => a + p.score, 0),
  }));
  const teamTop = teamRows[0].game === teamRows[1].game ? null : teamRows[0].game > teamRows[1].game ? 1 : 2;
  return (
    <div className="finish stagger">
      <p className="eyebrow">Game over</p>
      <h2 className="h1">
        {teamed
          ? teamTop
            ? `Team ${teamTop} wins!`
            : "The teams are level!"
          : top.game <= 0
            ? "Everyone's level"
            : tie
              ? "It's a tie at the top!"
              : `${top.n} wins!`}
      </h2>
      <table className="podium-table">
        <caption className="sr-only">Scores for this game and for the night so far</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Player</span>
            </th>
            <th scope="col">This game</th>
            <th scope="col">Total after {played === 1 ? "1 game" : `${played} games`}</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((p, i) => (
            <tr key={p.id} className={clsx(i === 0 && !tie && top.game > 0 && "first")}>
              <th scope="row">
                <span className="place">{i + 1}</span> {p.n}
              </th>
              <td className="pts">+{p.game}</td>
              <td className="tot">{p.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {teamed && (
        <p className="team-line">
          {teamRows.map((r) => (
            <span key={r.t}>
              Team {r.t}: <b>+{r.game}</b> this game, <b>{r.total}</b> total
            </span>
          ))}
        </p>
      )}
      <div className="actions center">
        <button
          className="btn"
          onClick={() => {
            markStart();
            onAgain();
          }}
          autoFocus
        >
          {label}
        </button>
        <button className="btn ghost" onClick={() => go("/games")}>
          Pick another game
        </button>
      </div>
    </div>
  );
}

/** Keyboard helper: Space/Enter → next, 1–9 → option. Ignored while typing or when a sheet is open. */
export function useKeys(handler: (k: string, e: KeyboardEvent) => void, deps: unknown[]) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (document.querySelector(".sheet")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      handler(e.key, e);
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
