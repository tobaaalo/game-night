import { useEffect, useState } from "react";
import clsx from "clsx";
import type { RoomState } from "../shared/protocol";
import { canMove, teamOf, type TeamMsg, type TTeam } from "../shared/team";
import { ABC, route, wordsOf } from "./extra";

type Team = NonNullable<RoomState["team"]>;

/** Word Ladder in a room: alone, in teams, racing or taking turns. Every change goes through the room. */
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
  const name = (id: string) => team.members.find((m) => m.id === id)?.name ?? "Someone";
  const here = new Set(team.members.filter((m) => m.here).map((m) => m.id));
  const mine = teamOf(team, me);
  const label = (t: TTeam, k: number) => (t.members.length === 1 ? name(t.members[0]) : `Team ${k + 1}`);
  const idx = (t: TTeam) => team.teams.indexOf(t);
  const [, start, goal, par] = team.puzzles[Math.min(team.i, team.puzzles.length - 1)];

  // One after another: everyone watches the team that is playing. Otherwise you see your own team.
  const shown = team.vs === "after" && team.status === "play" ? team.teams[team.active] : (mine ?? team.teams[0]);
  const b = shown.board;
  const isMine = shown === mine;
  const cur = b.chain[b.chain.length - 1];
  const moves = b.chain.length - 1;
  const shared = shown.members.length > 1;
  const playing = team.status === "play" && b.status === "play";
  const myGo = canMove(team, me, here);
  const other = b.picking && b.picking.by !== me ? b.picking : null;

  // A new word on my board clears the letter I was choosing.
  useEffect(() => {
    setPick(null);
    setMsg("");
  }, [b.v, team.i]);

  const choose = (i: number | null) => {
    setPick(i);
    send({ t: "team-pick", pos: i });
  };
  const tryLetter = (c: string) => {
    if (pick === null || !playing || !myGo) return;
    const w = cur.slice(0, pick) + c + cur.slice(pick + 1);
    setPick(null);
    send({ t: "team-pick", pos: null });
    if (w === cur) return;
    if (b.chain.includes(w)) return setMsg(`“${w.toUpperCase()}” is already on the ladder.`);
    if (w !== goal && !wordsOf(w.length).has(w)) return setMsg(`“${w.toUpperCase()}” isn't in our word list.`);
    setMsg("");
    send({ t: "team-move", word: w, v: b.v });
  };

  const board = (
    <div className="stack">
      <ol className="scorebar" aria-label="Scores">
        {team.teams.map((t, k) => (
          <li key={t.id} className={clsx(t === mine && "me", t === shown && team.vs === "after" && "now")}>
            <b>{label(t, k)}</b>
            <span>
              {t.score} pts{team.status === "play" ? ` · ${t.board.chain.length - 1} moves` : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );

  if (team.status === "done") {
    const ranked = [...team.teams].sort((a, c) => c.score - a.score);
    return (
      <div className="qcard stack center-text">
        <p className="eyebrow">Final result</p>
        <p className="h1">
          {label(ranked[0], idx(ranked[0]))} {ranked[0].members.length === 1 ? "wins!" : "win!"}
        </p>
        <ol className="tally">
          {ranked.map((t) => (
            <li key={t.id}>
              <b>
                {label(t, idx(t))}
                {t === mine ? " (you)" : ""}
              </b>
              <span>{t.score} pts</span>
            </li>
          ))}
        </ol>
        {team.teams.some((t) => t.members.length > 1) && (
          <p className="hint">
            Teams: {team.teams.map((t, k) => `${label(t, k)} is ${t.members.map(name).join(" and ")}`).join(". ")}.
          </p>
        )}
        {onFinish && (
          <button className="btn" onClick={onFinish.run}>
            {onFinish.label}
          </button>
        )}
      </div>
    );
  }

  const winner = team.teams.find((t) => t.id === team.winner);
  return (
    <div className="qcard stack center-text">
      <div className="qmeta">
        <p className="prog">
          Ladder {team.i + 1} / {team.puzzles.length}
        </p>
        <p className="prog">{team.vs === "race" ? "Race" : "One after another"}</p>
      </div>
      {board}
      {mine && mine.members.length > 1 && (
        <p className="hint">
          You are in {label(mine, idx(mine))} with{" "}
          {mine.members
            .filter((x) => x !== me)
            .map(name)
            .join(" and ")}
          .
        </p>
      )}
      {team.status === "play" && team.vs === "after" && !isMine && (
        <p className="turnbar" role="status">
          {label(shown, idx(shown))} is playing. Watch and wait for your go.
        </p>
      )}
      {team.status === "play" && team.vs === "after" && isMine && (
        <p className="turnbar mine" role="status">
          Your {shared ? "team's" : ""} go
        </p>
      )}
      {playing && isMine && shared && team.within === "turns" && (
        <p className={clsx("turnbar", myGo && "mine")} role="status">
          {b.turn === me ? "Your turn" : `${name(b.turn)}'s turn`}
        </p>
      )}
      {playing && isMine && shared && team.within === "free" && (
        <p className="turnbar" role="status">
          {other ? `${name(other.by)} is choosing a letter…` : "Anyone on your team can play"}
        </p>
      )}
      {playing && !isMine && b.picking && <p className="hint">{name(b.picking.by)} is choosing a letter…</p>}
      <p className="hint">
        Change one letter at a time to turn <b>{start.toUpperCase()}</b> into <b>{goal.toUpperCase()}</b>. Par is {par}{" "}
        moves.
      </p>
      <ol className="ladder">
        {b.chain.slice(0, -1).map((w) => (
          <li key={w}>{w.toUpperCase()}</li>
        ))}
      </ol>
      <div className="ladder-now" role="group" aria-label="Current word. Tap a letter to change it.">
        {cur.split("").map((c, i) => (
          <button
            key={i}
            className={clsx("ltile", pick === i && "on", other?.pos === i && "theirs")}
            disabled={!playing || !isMine || !myGo}
            onClick={() => choose(pick === i ? null : i)}
            aria-label={`Letter ${i + 1}: ${c}`}
          >
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="hint">
        Target: {goal.toUpperCase()} · {moves} {moves === 1 ? "move" : "moves"}
        {b.last && playing ? ` · ${name(b.last.by)} added ${b.last.word.toUpperCase()}` : ""}
      </p>
      {b.hint && playing && isMine && <p className="hint">Hint: try “{b.hint.toUpperCase()}” next.</p>}
      {pick !== null && playing && isMine && myGo && (
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
      {playing && isMine && (
        <div className="actions center">
          <button
            className="btn ghost small"
            disabled={b.chain.length < 2}
            onClick={() => send({ t: "team-undo", v: b.v })}
          >
            Undo
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              const r = route(cur, goal);
              if (r.length > 1) send({ t: "team-hint", word: r[1], v: b.v });
            }}
          >
            Hint (−1 point)
          </button>
          {team.within === "turns" && shared && (
            <button className="btn ghost small" disabled={!myGo} onClick={() => send({ t: "team-pass", v: b.v })}>
              Pass (−1 point)
            </button>
          )}
          <button className="btn ghost small" onClick={() => send({ t: "team-giveup", v: b.v })}>
            Give up
          </button>
        </div>
      )}
      {team.status === "play" && mine && mine.board.status === "won" && team.vs === "after" && (
        <p className="h3">Solved in {mine.board.chain.length - 1} moves. Waiting for the other teams.</p>
      )}
      {team.status === "play" && mine && mine.board.status === "gave" && team.vs === "after" && (
        <p className="hint">You gave up on this one. Waiting for the other teams.</p>
      )}
      {team.status === "round" && (
        <div className="stack">
          <p className="h3">
            {winner
              ? `${label(winner, idx(winner))} ${winner.members.length === 1 ? "wins" : "win"} this ladder!`
              : team.note}
          </p>
          {winner && team.note && <p className="hint">{team.note}</p>}
          <ol className="tally">
            {team.teams.map((t) => (
              <li key={t.id}>
                <b>
                  {label(t, idx(t))}
                  {t === mine ? " (you)" : ""}
                </b>
                <span>
                  {t.board.status === "won"
                    ? `${t.board.chain.length - 1} moves`
                    : t.board.status === "gave"
                      ? "gave up"
                      : "did not finish"}
                  {t.gained ? `, +${t.gained}` : ""}
                </span>
              </li>
            ))}
          </ol>
          <p className="hint">
            One way through:{" "}
            {route(start, goal)
              .map((w) => w.toUpperCase())
              .join(" → ")}
          </p>
          <button className="btn" onClick={() => send({ t: "team-next", rv: team.rv })}>
            {team.i + 1 < team.puzzles.length ? "Next ladder" : "See results"}
          </button>
        </div>
      )}
    </div>
  );
}
