import { useEffect, useState } from "react";
import clsx from "clsx";
import type { RoomState } from "../shared/protocol";
import type { TeamMsg } from "../shared/team";
import { ABC, route, wordsOf } from "./extra";

type Team = NonNullable<RoomState["team"]>;

/** Word Ladder for two or more phones on one team. Every change goes through the room, so each phone sees it live. */
export function TeamLadder({
  team,
  me,
  send,
  onFinish,
}: {
  team: Team;
  me: string;
  send: (m: TeamMsg) => void;
  onFinish?: { label: string; run: () => void };
}) {
  const [pick, setPick] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [, start, goal, par] = team.puzzles[Math.min(team.i, team.puzzles.length - 1)];
  const cur = team.chain[team.chain.length - 1];
  const moves = team.chain.length - 1;
  const name = (id: string) => team.members.find((m) => m.id === id)?.name ?? "Someone";
  const holder = team.members.find((m) => m.id === team.turn);
  const myTurn = team.mode === "free" || team.turn === me || !holder?.here;
  const playing = team.status === "play";
  const other = team.picking && team.picking.by !== me ? team.picking : null;

  // A new word from anyone clears the letter I was choosing.
  useEffect(() => {
    setPick(null);
    setMsg("");
  }, [team.v]);

  const choose = (i: number | null) => {
    setPick(i);
    send({ t: "team-pick", pos: i });
  };
  const tryLetter = (c: string) => {
    if (pick === null || !playing || !myTurn) return;
    const w = cur.slice(0, pick) + c + cur.slice(pick + 1);
    setPick(null);
    send({ t: "team-pick", pos: null });
    if (w === cur) return;
    if (team.chain.includes(w)) return setMsg(`“${w.toUpperCase()}” is already on the ladder.`);
    if (w !== goal && !wordsOf(w.length).has(w)) return setMsg(`“${w.toUpperCase()}” isn't in our word list.`);
    setMsg("");
    send({ t: "team-move", word: w, v: team.v });
  };

  if (team.status === "done") {
    const rows = team.members
      .map((m) => ({ ...m, n: team.moves[m.id] ?? 0, f: team.finishes[m.id] ?? 0 }))
      .sort((a, b) => b.f - a.f || b.n - a.n);
    return (
      <div className="qcard stack center-text">
        <p className="eyebrow">Team result</p>
        <p className="h1">{team.score} points</p>
        <p className="hint">
          {team.puzzles.length} ladders{team.passes ? `, ${team.passes} passed` : ""}.
        </p>
        <ul className="tally">
          {rows.map((r) => (
            <li key={r.id}>
              <b>{r.name}</b>
              <span>
                {r.n} words, {r.f} {r.f === 1 ? "finish" : "finishes"}
              </span>
            </li>
          ))}
        </ul>
        {onFinish && (
          <button className="btn" onClick={onFinish.run}>
            {onFinish.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="qcard stack center-text">
      <div className="qmeta">
        <p className="prog">
          Ladder {team.i + 1} / {team.puzzles.length}
        </p>
        <p className="prog">Team score {team.score}</p>
      </div>
      {team.mode === "turns" && playing && (
        <p className={clsx("turnbar", myTurn && "mine")} role="status">
          {team.turn === me ? "Your turn" : `${name(team.turn)}'s turn`}
        </p>
      )}
      {team.mode === "free" && playing && (
        <p className="turnbar" role="status">
          {other ? `${name(other.by)} is choosing a letter…` : "Both of you can play"}
        </p>
      )}
      <p className="hint">
        Change one letter at a time to turn <b>{start.toUpperCase()}</b> into <b>{goal.toUpperCase()}</b>. Par is {par}{" "}
        moves.
      </p>
      <ol className="ladder">
        {team.chain.slice(0, -1).map((w) => (
          <li key={w}>{w.toUpperCase()}</li>
        ))}
      </ol>
      <div className="ladder-now" role="group" aria-label="Current word. Tap a letter to change it.">
        {cur.split("").map((c, i) => (
          <button
            key={i}
            className={clsx("ltile", pick === i && "on", other?.pos === i && "theirs")}
            disabled={!playing || !myTurn}
            onClick={() => choose(pick === i ? null : i)}
            aria-label={`Letter ${i + 1}: ${c}`}
          >
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="hint">
        Target: {goal.toUpperCase()} · {moves} {moves === 1 ? "move" : "moves"}
        {team.last && playing ? ` · ${name(team.last.by)} added ${team.last.word.toUpperCase()}` : ""}
      </p>
      {team.hint && playing && <p className="hint">Hint: try “{team.hint.toUpperCase()}” next.</p>}
      {pick !== null && playing && myTurn && (
        <div className="lpicker" role="group" aria-label="Pick a new letter">
          {ABC.map((c) => (
            <button key={c} className="lkey" onClick={() => tryLetter(c)}>
              {c.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      {msg && (
        <p className="error-text" role="status">
          {msg}
        </p>
      )}
      {playing && (
        <div className="actions center">
          <button
            className="btn ghost small"
            disabled={team.chain.length < 2}
            onClick={() => send({ t: "team-undo", v: team.v })}
          >
            Undo
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              const r = route(cur, goal);
              if (r.length > 1) send({ t: "team-hint", word: r[1], v: team.v });
            }}
          >
            Hint (−1 point)
          </button>
          {team.mode === "turns" && (
            <button className="btn ghost small" disabled={!myTurn} onClick={() => send({ t: "team-pass", v: team.v })}>
              Pass (−1 point)
            </button>
          )}
          <button className="btn ghost small" onClick={() => send({ t: "team-giveup", v: team.v })}>
            Give up
          </button>
        </div>
      )}
      {team.status === "solved" && (
        <>
          <p className="h3">
            {moves <= par ? "Par or better!" : "Solved!"} {moves} moves, +{team.earned}
            {team.last ? ` · ${name(team.last.by)} finished it` : ""}
          </p>
          <button className="btn" onClick={() => send({ t: "team-next", v: team.v })}>
            {team.i + 1 < team.puzzles.length ? "Next ladder" : "See results"}
          </button>
        </>
      )}
      {team.status === "gave" && (
        <>
          <p className="hint">One way through: {route(start, goal).map((w) => w.toUpperCase()).join(" → ")}</p>
          <button className="btn" onClick={() => send({ t: "team-next", v: team.v })}>
            {team.i + 1 < team.puzzles.length ? "Next ladder" : "See results"}
          </button>
        </>
      )}
    </div>
  );
}
