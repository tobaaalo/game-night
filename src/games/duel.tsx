import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { nameOf, useApp } from "../lib/app";
import {
  C4_COLS,
  C4_ROWS,
  DOT_BOXES,
  DOT_EDGES,
  DOT_H,
  GAME_NAMES,
  RPS_NAMES,
  SHIP_N,
  duelBot,
  duelMove,
  duelReady,
  duelShuffle,
  matchNew,
  matchNext,
  matchSettle,
  matchWinner,
  type DuelGame,
  type Match,
  type Side,
} from "../shared/duel";
import { Finish } from "./frame";

const RPS_ICONS = ["✊", "✋", "✌️"];
const MARK = ["X", "O"];

export interface BoardProps {
  m: Match;
  /** Which side is looking: 0 or 1, or -1 when only watching. */
  side: Side | null;
  names: [string, string];
  onMove: (i: number) => void;
  onShuffle?: () => void;
  onReady?: () => void;
  onNext: () => void;
  /** Two people share one phone, so the board always belongs to whoever's turn it is. */
  hot?: boolean;
  /** The computer is thinking. */
  thinking?: boolean;
  /** Who may press the button that moves on after a game. */
  canNext?: boolean;
  /** Shown instead of the next button when the other player has gone. */
  note?: string;
}

/** The score line, the status line and the board. The same screen runs on one phone and in a room. */
export function DuelBoard({
  m,
  side,
  names,
  onMove,
  onShuffle,
  onReady,
  onNext,
  hot,
  thinking,
  canNext = true,
  note,
}: BoardProps) {
  const d = m.duel;
  const g = d.game;
  const viewer: Side | null = hot && !d.over ? d.turn : side;
  const mine = viewer !== null && d.turn === viewer && !d.over && !d.placing && !thinking;
  // Sharing one phone, everyone is called by name. Otherwise you are "You".
  const you: Side | null = hot ? null : viewer;
  const who = (s: Side) => (you === s ? "You" : names[s]);
  const whose = (s: Side) => (you === s ? "Your" : `${names[s]}'s`);
  let status = "";
  if (d.over) {
    if (g === "rps" && d.winner === -1) status = "Same pick. Go again.";
    else if (d.winner === -1) status = "A draw.";
    else status = you === d.winner ? "You won this game!" : `${names[d.winner]} won this game.`;
    if (m.done) {
      const w = matchWinner(m);
      status = w === -1 ? "The match is a draw." : you === w ? "You won the match!" : `${names[w]} won the match.`;
    }
  } else if (g === "ship" && d.placing) {
    status =
      you !== null && d.ready[you] ? `Waiting for ${names[you === 0 ? 1 : 0]}…` : "Set up your fleet, then tap Ready.";
  } else if (g === "rps") {
    status =
      you !== null && d.pick[you] === -1
        ? "Pick one."
        : you !== null
          ? `Waiting for ${names[you === 0 ? 1 : 0]}…`
          : "Both players are picking…";
  } else status = thinking ? `${names[d.turn]} is thinking…` : `${whose(d.turn)} turn`;
  const bestLabel = m.best > 1 ? `Best of ${m.best}` : "One game";
  return (
    <div className="qcard duel stack center-text" data-game={g}>
      <div className="duel-score" aria-label="Score">
        {([0, 1] as Side[]).map((s) => (
          <div
            key={s}
            className={clsx("duel-side", `s${s}`, !d.over && d.turn === s && !(g === "rps" || d.placing) && "on")}
          >
            <span className="duel-name">
              {g === "ttt" ? <b aria-hidden="true">{MARK[s]}</b> : <i className={`dot s${s}`} aria-hidden="true" />}
              {who(s)}
            </span>
            <strong className="mono">{m.wins[s]}</strong>
          </div>
        ))}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {GAME_NAMES[g]} · {bestLabel}
        {m.best > 1 ? ` · Game ${Math.min(m.played + (d.over && m.counted ? 0 : 1), m.best)}` : ""}
      </p>
      <div className="duel-status">
        <p className="turn" role="status" aria-live="polite">
          {status}
        </p>
      </div>
      <p className="hint duel-note">{!d.over && d.note ? d.note : "\u00a0"}</p>
      {g === "ttt" && <Ttt m={m} mine={mine} onMove={onMove} />}
      {g === "c4" && <Connect m={m} mine={mine} onMove={onMove} />}
      {g === "dots" && <Dots m={m} mine={mine} onMove={onMove} />}
      {g === "rps" && <Rps m={m} viewer={viewer} onMove={onMove} thinking={!!thinking} names={names} />}
      {g === "ship" && (
        <Ship m={m} viewer={viewer} mine={mine} onMove={onMove} onShuffle={onShuffle} onReady={onReady} names={names} />
      )}
      <div className="actions center duel-actions">
        {d.over &&
          (note ? (
            <p className="hint">{note}</p>
          ) : canNext ? (
            <button className="btn" onClick={onNext} autoFocus>
              {m.done ? "See the result" : g === "rps" && d.winner === -1 ? "Go again" : "Next game"}
            </button>
          ) : (
            <p className="hint">Waiting for a player to carry on…</p>
          ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Tic-Tac-Toe */

function Ttt({ m, mine, onMove }: { m: Match; mine: boolean; onMove: (i: number) => void }) {
  const d = m.duel;
  return (
    <div className="ttt" role="grid" aria-label="Tic-Tac-Toe board">
      {d.b.map((v, i) => (
        <button
          key={i}
          role="gridcell"
          className={clsx("duel-cell", v && `s${v - 1}`, d.line.includes(i) && "win", d.last === i && "last")}
          disabled={!mine || !!v}
          aria-label={`Square ${i + 1}${v ? `, ${MARK[v - 1]}` : ", empty"}`}
          onClick={() => onMove(i)}
        >
          {v ? MARK[v - 1] : ""}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Connect Four */

function Connect({ m, mine, onMove }: { m: Match; mine: boolean; onMove: (i: number) => void }) {
  const d = m.duel;
  return (
    <div className="c4" role="group" aria-label="Connect Four board">
      {Array.from({ length: C4_COLS }, (_, c) => {
        const full = d.b[c] !== 0;
        return (
          <button
            key={c}
            className="c4-col"
            disabled={!mine || full}
            aria-label={`Drop in column ${c + 1}${full ? ", full" : ""}`}
            onClick={() => onMove(c)}
          >
            {Array.from({ length: C4_ROWS }, (_, r) => {
              const i = r * C4_COLS + c;
              const v = d.b[i];
              return (
                <span
                  key={r}
                  className={clsx("c4-cell", v && `s${v - 1}`, d.line.includes(i) && "win", d.last === i && "last")}
                />
              );
            })}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------- Dots and Boxes */

const GAP = 22;
const PAD = 8;
const SIZE = DOT_BOXES * GAP + PAD * 2;
const edgeXY = (e: number): { x: number; y: number; h: boolean } => {
  if (e < DOT_H) {
    const r = Math.floor(e / DOT_BOXES);
    const c = e % DOT_BOXES;
    return { x: PAD + c * GAP + GAP / 2, y: PAD + r * GAP, h: true };
  }
  const k = e - DOT_H;
  const r = Math.floor(k / (DOT_BOXES + 1));
  const c = k % (DOT_BOXES + 1);
  return { x: PAD + c * GAP, y: PAD + r * GAP + GAP / 2, h: false };
};

function Dots({ m, mine, onMove }: { m: Match; mine: boolean; onMove: (i: number) => void }) {
  const d = m.duel;
  const edges = Array.from({ length: DOT_EDGES }, (_, i) => i);
  return (
    <svg className="dots" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Dots and Boxes board">
      {d.b.map((v, i) => {
        const r = Math.floor(i / DOT_BOXES);
        const c = i % DOT_BOXES;
        return v ? (
          <g key={i}>
            <rect
              className={`box s${v - 1}`}
              x={PAD + c * GAP + 1}
              y={PAD + r * GAP + 1}
              width={GAP - 2}
              height={GAP - 2}
              rx="2"
            />
            <text className="boxmark" x={PAD + c * GAP + GAP / 2} y={PAD + r * GAP + GAP / 2 + 3.5} textAnchor="middle">
              {v === 1 ? "●" : "◆"}
            </text>
          </g>
        ) : null;
      })}
      {edges.map((e) => {
        const { x, y, h } = edgeXY(e);
        const v = d.e[e];
        return (
          <line
            key={`l${e}`}
            className={clsx("edge", v && `s${v - 1}`, d.last === e && "last")}
            x1={h ? x - GAP / 2 : x}
            x2={h ? x + GAP / 2 : x}
            y1={h ? y : y - GAP / 2}
            y2={h ? y : y + GAP / 2}
          />
        );
      })}
      {Array.from({ length: (DOT_BOXES + 1) ** 2 }, (_, i) => (
        <circle
          key={`d${i}`}
          className="pt"
          cx={PAD + (i % (DOT_BOXES + 1)) * GAP}
          cy={PAD + Math.floor(i / (DOT_BOXES + 1)) * GAP}
          r="2.6"
        />
      ))}
      {mine &&
        edges
          .filter((e) => !d.e[e])
          .map((e) => {
            const { x, y, h } = edgeXY(e);
            const len = GAP - 4;
            const thick = 17;
            return (
              <rect
                key={`h${e}`}
                className="hit"
                role="button"
                tabIndex={0}
                aria-label={`Draw line ${e + 1}`}
                x={h ? x - len / 2 : x - thick / 2}
                y={h ? y - thick / 2 : y - len / 2}
                width={h ? len : thick}
                height={h ? thick : len}
                onClick={() => onMove(e)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    onMove(e);
                  }
                }}
              />
            );
          })}
    </svg>
  );
}

/* ---------------------------------------------------- Rock Paper Scissors */

function Rps({
  m,
  viewer,
  onMove,
  thinking,
  names,
}: {
  m: Match;
  viewer: Side | null;
  onMove: (i: number) => void;
  thinking: boolean;
  names: [string, string];
}) {
  const d = m.duel;
  const mineSet = viewer !== null && d.pick[viewer] !== -1;
  return (
    <div className="stack">
      {d.over ? (
        <div className="rps-reveal" aria-label="What each player picked">
          {([0, 1] as Side[]).map((s) => (
            <div key={s} className={clsx("rps-pick", d.winner === s && "win")}>
              <span className="rps-icon" aria-hidden="true">
                {RPS_ICONS[d.pick[s]]}
              </span>
              <span>
                {viewer === s ? "You" : names[s]}: {RPS_NAMES[d.pick[s]]}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rps-row">
          {RPS_NAMES.map((n, i) => (
            <button
              key={n}
              className={clsx("rps-btn", viewer !== null && d.pick[viewer] === i && "on")}
              disabled={viewer === null || mineSet || thinking}
              onClick={() => onMove(i)}
              aria-label={n}
            >
              <span className="rps-icon" aria-hidden="true">
                {RPS_ICONS[i]}
              </span>
              <span>{n}</span>
            </button>
          ))}
        </div>
      )}
      {d.note && d.over && <p className="hint">{d.note}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- Battleship */

function Water({
  fleet,
  shots,
  show,
  fire,
  label,
  small,
  last,
}: {
  fleet: number[];
  shots: number[];
  show: boolean;
  fire?: (i: number) => void;
  label: string;
  small?: boolean;
  last: number;
}) {
  return (
    <div className={clsx("sea", small && "small", fire && "live")} role="grid" aria-label={label}>
      {Array.from({ length: SHIP_N * SHIP_N }, (_, i) => {
        const shot = shots[i];
        const ship = show && fleet[i] > 0;
        const cls = clsx("sea-cell", ship && "ship", shot === 1 && "miss", shot === 2 && "hit", last === i && "last");
        const text = shot === 2 ? "✕" : shot === 1 ? "•" : "";
        const name = `${String.fromCharCode(65 + Math.floor(i / SHIP_N))}${(i % SHIP_N) + 1}`;
        return fire ? (
          <button
            key={i}
            role="gridcell"
            className={cls}
            disabled={!!shot}
            aria-label={`${name}${shot === 2 ? ", hit" : shot === 1 ? ", miss" : ""}`}
            onClick={() => fire(i)}
          >
            {text}
          </button>
        ) : (
          <span
            key={i}
            role="gridcell"
            className={cls}
            aria-label={`${name}${ship ? ", ship" : ""}${shot === 2 ? ", hit" : shot === 1 ? ", miss" : ""}`}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

function Ship({
  m,
  viewer,
  mine,
  onMove,
  onShuffle,
  onReady,
  names,
}: {
  m: Match;
  viewer: Side | null;
  mine: boolean;
  onMove: (i: number) => void;
  onShuffle?: () => void;
  onReady?: () => void;
  names: [string, string];
}) {
  const d = m.duel;
  if (viewer === null)
    return (
      <div className="stack">
        {([0, 1] as Side[]).map((s) => (
          <div key={s} className="stack">
            <p className="hint">{names[s]}&rsquo;s waters</p>
            <Water
              fleet={d.fleet[s]}
              shots={d.shots[s]}
              show={d.over}
              label={`${names[s]}'s waters`}
              small
              last={d.last}
            />
          </div>
        ))}
      </div>
    );
  const foe: Side = viewer === 0 ? 1 : 0;
  if (d.placing)
    return (
      <div className="stack">
        <p className="hint">Your fleet</p>
        <Water fleet={d.fleet[viewer]} shots={d.shots[viewer]} show label="Your fleet" last={-1} />
        {!d.ready[viewer] && (
          <div className="actions center">
            <button className="btn ghost" onClick={onShuffle}>
              Shuffle
            </button>
            <button className="btn" onClick={onReady}>
              Ready
            </button>
          </div>
        )}
      </div>
    );
  return (
    <div className="stack">
      <p className="hint">Tap a square to fire at {viewer === 0 ? names[1] : names[0]}</p>
      <Water
        fleet={d.fleet[foe]}
        shots={d.shots[foe]}
        show={d.over}
        label={`${names[foe]}'s waters`}
        fire={mine ? onMove : undefined}
        last={(d.over ? d.winner === viewer : d.turn === foe) ? d.last : -1}
      />
      <p className="hint">Your fleet</p>
      <Water
        fleet={d.fleet[viewer]}
        shots={d.shots[viewer]}
        show
        label="Your fleet"
        small
        last={(d.over ? d.winner !== viewer : d.turn === viewer) ? d.last : -1}
      />
    </div>
  );
}

/* ------------------------------------------------------- One phone: local play */

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Two people on one phone, or one person against the computer. */
export function DuelLocal({ game, best, onAgain }: { game: DuelGame; best: number; onAgain: () => void }) {
  const { players, award } = useApp();
  const botIdx = players.findIndex((p) => p.bot);
  const skill = (players[botIdx]?.skill ?? 2) as 1 | 2 | 3;
  const names = useMemo(() => [nameOf(players[0], 0), nameOf(players[1], 1)] as [string, string], [players]);
  const ids = useMemo(() => [players[0].id, players[1].id] as [string, string], [players]);
  const [m, setM] = useState<Match>(() => matchNew(game, best, ids, Math.random() < 0.5 ? 0 : 1));
  const ref = useRef(m);
  const [fin, setFin] = useState(false);
  const apply = (fn: (n: Match) => void) => {
    const n = clone(ref.current);
    fn(n);
    matchSettle(n, (s) => award(n.sides[s], 1));
    ref.current = n;
    setM(n);
  };
  // The human is side 0 unless the computer is first in the list.
  const human: Side = botIdx === 0 ? 1 : 0;
  const botSide: Side | null = botIdx === 0 ? 0 : botIdx === 1 ? 1 : null;
  const d = m.duel;
  const botTurn =
    botSide !== null &&
    !d.over &&
    (d.game === "rps"
      ? d.pick[botSide] === -1
      : d.game === "ship" && d.placing
        ? !d.ready[botSide]
        : !d.placing && d.turn === botSide);
  useEffect(() => {
    if (!botTurn || botSide === null) return;
    const t = setTimeout(
      () =>
        apply((n) => {
          const dd = n.duel;
          if (dd.game === "ship" && dd.placing) duelReady(dd, botSide);
          else duelMove(dd, botSide, duelBot(dd, botSide, skill));
        }),
      d.game === "ship" && d.placing ? 400 : d.game === "rps" ? 500 : 750,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botTurn, d.turn, d.b.join(""), d.e.join(""), d.pick.join(), d.ready.join()]);
  if (fin) return <Finish onAgain={onAgain} />;
  return (
    <DuelBoard
      m={m}
      side={botSide !== null ? human : null}
      names={names}
      hot={botSide === null}
      thinking={botTurn && d.game !== "rps" && !d.placing}
      onMove={(i) => apply((n) => void duelMove(n.duel, botSide !== null ? human : n.duel.turn, i))}
      onShuffle={() => apply((n) => void duelShuffle(n.duel, human))}
      onReady={() => apply((n) => void duelReady(n.duel, human))}
      onNext={() => {
        if (ref.current.done) return setFin(true);
        apply((n) => void matchNext(n));
      }}
    />
  );
}
