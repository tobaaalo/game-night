import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Icon, Scoreboard } from "../components/ui";
import { useApp } from "../lib/app";
import { pick } from "../lib/deck";
import { SECTIONS, gamesFor, gameById, type GameDef, type Section } from "../games/registry";
import { GameFrame } from "../games/frame";

export function Library() {
  const { group, players, go, online } = useApp();
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    if (!group) go("/who", { replace: true });
  }, [group, go]);
  const games = useMemo(
    () => gamesFor(group).filter((g) => !g.minPlayers || players.length >= g.minPlayers || g.section === "yours"),
    [group, players.length],
  );
  const hidden = useMemo(
    () => gamesFor(group).filter((g) => g.minPlayers && players.length < g.minPlayers),
    [group, players.length],
  );
  const sections = (Object.keys(SECTIONS) as Section[])
    .map((s) => ({ s, list: games.filter((g) => g.section === s) }))
    .filter((x) => x.list.length);
  let n = 0;
  const surprise = () => {
    if (spinning) return;
    setSpinning(true);
    const g = pick(games.filter((x) => x.section !== "yours"));
    setTimeout(() => go(`/play/${g.id}`), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650);
  };
  return (
    <div className="screen library">
      <div className="lib-head stagger">
        <div>
          <p className="eyebrow">{group === "couple" ? "Date night" : "Game night"}</p>
          <h1 className="h1" tabIndex={-1}>
            Pick a game
          </h1>
        </div>
        <Scoreboard players={players} compact />
      </div>

      <div className="lib-feature stagger">
        <button
          className={clsx("buzzer", spinning && "pressed")}
          onClick={surprise}
          aria-label="Surprise us: pick a random game"
        >
          <span className="buzzer-cap">
            <Icon.shuffle />
          </span>
          <span className="buzzer-label">Surprise us</span>
        </button>
        {group === "friends" && (
          <button className="roomcard" onClick={() => go("/room")} disabled={!online} aria-describedby="room-sub">
            <span className="roomcard-icon" aria-hidden="true">
              <Icon.phones />
            </span>
            <span>
              <span className="roomcard-title">Play on everyone&rsquo;s phones</span>
              <span className="roomcard-sub" id="room-sub">
                {online
                  ? "Friends join with a 4-letter code and answer on their own phone."
                  : "Needs internet. Pass-the-phone games still work offline."}
              </span>
            </span>
          </button>
        )}
      </div>

      {sections.map(({ s, list }) => (
        <section key={s} className="lib-section" aria-labelledby={`sec-${s}`}>
          <div className="sec-sign">
            <h2 id={`sec-${s}`} className="h3">
              {SECTIONS[s].title}
            </h2>
            <span className="muted small">{SECTIONS[s].blurb}</span>
          </div>
          <ul className="tickets">
            {list.map((g) => {
              n += 1;
              return (
                <li key={g.id}>
                  <Ticket g={g} n={n} showRoom={group === "friends"} onOpen={() => go(`/play/${g.id}`)} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="lib-section" aria-labelledby="sec-make">
        <div className="make-strip">
          <div>
            <h2 id="sec-make" className="h3">
              Make your own
            </h2>
            <p className="muted small">A quiz about your wedding, your family, your church group. Takes a minute.</p>
          </div>
          <button className="btn quiet" onClick={() => go("/make")}>
            <Icon.plus /> New game
          </button>
        </div>
      </section>
      {hidden.length > 0 && (
        <p className="hint center-text">
          {hidden.map((g) => g.name).join(", ")} need{hidden.length === 1 ? "s" : ""} at least{" "}
          {Math.min(...hidden.map((g) => g.minPlayers ?? 3))} players.{" "}
          <button className="link" onClick={() => go("/names")}>
            Add players
          </button>
        </p>
      )}
    </div>
  );
}

function Ticket({ g, n, onOpen, showRoom }: { g: GameDef; n: number; onOpen: () => void; showRoom: boolean }) {
  return (
    <button className="ticket" onClick={onOpen}>
      <span className="stub" aria-hidden="true">
        <span className="stub-no">{String(n).padStart(2, "0")}</span>
      </span>
      <span className="ticket-body">
        <span className="ticket-title">{g.name}</span>
        <span className="ticket-blurb">{g.blurb}</span>
        <span className="ticket-meta">
          {g.stat}
          {g.room && showRoom && <span className="tag">Plays on phones</span>}
        </span>
      </span>
    </button>
  );
}

export function PlayRoute({ id }: { id: string }) {
  const g = gameById(id);
  const { go, players, group } = useApp();
  useEffect(() => {
    if (!group) go("/who", { replace: true });
  }, [group, go]);
  if (!g)
    return (
      <div className="screen empty">
        <h1 className="h2" tabIndex={-1}>
          That game isn&rsquo;t here
        </h1>
        <p className="lede">It may have been one of your own games that was deleted on this phone.</p>
        <button className="btn" onClick={() => go("/games")}>
          Back to games
        </button>
      </div>
    );
  if (g.minPlayers && players.length < g.minPlayers)
    return (
      <div className="screen empty">
        <h1 className="h2" tabIndex={-1}>
          {g.name} needs {g.minPlayers}+ players
        </h1>
        <p className="lede">Add a few more names and you&rsquo;re good to go.</p>
        <button className="btn" onClick={() => go("/names")}>
          Add players
        </button>
      </div>
    );
  return (
    <GameFrame title={g.name} how={g.how} scores={g.scores !== false}>
      <g.Play />
    </GameFrame>
  );
}
