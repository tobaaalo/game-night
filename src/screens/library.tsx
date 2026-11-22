import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Icon, Scoreboard } from "../components/ui";
import { WithPlayers, useApp } from "../lib/app";
import { NEEDS, botMode, hasBot, humans } from "../lib/bot";
import { pick } from "../lib/deck";
import { SECTIONS, gamesFor, gameById, type GameDef, type Section } from "../games/registry";
import { GameFrame } from "../games/frame";
import { CUSTOM_TYPES, loadCustom, saveCustom } from "../lib/custom";
import { load, save } from "../lib/store";
import { getPublic, getShared, loadCommunity, saveCommunity } from "../lib/shared";
import type { SharedGame } from "../shared/protocol";

export function Library() {
  const { group, players, go, online } = useApp();
  const [spinning, setSpinning] = useState(false);
  const [view, setViewState] = useState<"list" | "grid">(() =>
    load<"list" | "grid">("gn.libview", matchMedia("(max-width: 600px)").matches ? "grid" : "list"),
  );
  const [shut, setShut] = useState<string[]>(() => load<string[]>("gn.libshut", []));
  const setView = (v: "list" | "grid") => {
    setViewState(v);
    save("gn.libview", v);
  };
  const toggle = (id: string) =>
    setShut((a) => {
      const n = a.includes(id) ? a.filter((x) => x !== id) : [...a, id];
      save("gn.libshut", n);
      return n;
    });
  const [community, setCommunity] = useState<SharedGame[]>(loadCommunity);
  useEffect(() => {
    if (!online) return;
    getPublic()
      .then((l) => {
        setCommunity(l);
        saveCommunity(l);
      })
      .catch(() => undefined);
  }, [online]);
  useEffect(() => {
    if (!online) return;
    // Drop copies of other people's games once the original has been deleted.
    const copies = loadCustom().filter((g) => g.fromLink && g.shareId);
    copies.forEach((g) =>
      getShared(g.shareId as string).catch((e: Error) => {
        if (e.message === "Game not found.") saveCustom(loadCustom().filter((x) => x.id !== g.id));
      }),
    );
  }, [online]);
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
  const pool = games.filter((x) => x.section !== "yours");
  const daily = pool.length ? pool[Math.floor(Date.now() / 86400000) % pool.length] : null;
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

      <div className="lib-bar stagger">
        <div className="view-toggle" role="group" aria-label="How to show games">
          <button aria-pressed={view === "grid"} onClick={() => setView("grid")}>
            Grid
          </button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")}>
            List
          </button>
        </div>
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
      </div>

      <div className="lib-feature stagger">
        {daily && (
          <button className="roomcard" onClick={() => go(`/play/${daily.id}`)}>
            <span className="roomcard-icon" aria-hidden="true">
              <Icon.shuffle />
            </span>
            <span className="roomcard-text">
              <span className="roomcard-title">Today&rsquo;s pick</span>
              <span className="roomcard-sub">{daily.name}</span>
            </span>
          </button>
        )}
        {
          <button className="roomcard" onClick={() => go("/room")} disabled={!online} aria-describedby="room-sub">
            <span className="roomcard-icon" aria-hidden="true">
              <Icon.phones />
            </span>
            <span className="roomcard-text">
              <span className="roomcard-title">Join by phone</span>
              <span className="roomcard-sub" id="room-sub">
                {online ? "Open a room or join with a code" : "Needs internet"}
              </span>
            </span>
          </button>
        }
      </div>

      {sections.map(({ s, list }) => (
        <section key={s} className="lib-section" aria-labelledby={`sec-${s}`}>
          <h2 id={`sec-${s}`} className="sec-sign h3">
            <button
              className="sec-toggle"
              aria-expanded={!shut.includes(s)}
              aria-controls={`list-${s}`}
              onClick={() => toggle(s)}
            >
              <span>{SECTIONS[s].title}</span>
              <span className="sec-count">{list.length}</span>
              <span className={clsx("sec-chev", shut.includes(s) && "shut")}>
                <Icon.chevron />
              </span>
            </button>
          </h2>
          <ul id={`list-${s}`} className={clsx("tickets", view)} hidden={shut.includes(s)}>
            {list.map((g) => {
              n += 1;
              return (
                <li key={g.id}>
                  <Ticket g={g} n={n} view={view} showRoom onOpen={() => go(`/play/${g.id}`)} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {community.length > 0 && (
        <section className="lib-section" aria-labelledby="sec-community">
          <h2 id="sec-community" className="sec-sign h3">
            <button
              className="sec-toggle"
              aria-expanded={!shut.includes("community")}
              aria-controls="list-community"
              onClick={() => toggle("community")}
            >
              <span>From other players</span>
              <span className="sec-count">{community.length}</span>
              <span className={clsx("sec-chev", shut.includes("community") && "shut")}>
                <Icon.chevron />
              </span>
            </button>
          </h2>
          <ul id="list-community" className={clsx("tickets", view)} hidden={shut.includes("community")}>
            {community.map((g) => (
              <li key={g.id}>
                <button className="ticket" onClick={() => go(`/g/${g.id}`)}>
                  <span className="stub" aria-hidden="true">
                    <span className="stub-no">
                      <Icon.people />
                    </span>
                  </span>
                  <span className="ticket-body">
                    <span className="ticket-title">{g.name}</span>
                    <span className="ticket-blurb">{CUSTOM_TYPES[g.type].label}</span>
                    <span className="ticket-meta">{g.author ? `By ${g.author}` : "Shared game"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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

function Ticket({
  g,
  n,
  view,
  onOpen,
  showRoom = true,
}: {
  g: GameDef;
  n: number;
  view: "list" | "grid";
  onOpen: () => void;
  showRoom?: boolean;
}) {
  const room = g.room && showRoom;
  if (view === "grid")
    return (
      <button className={clsx("tile", room && "inroom")} onClick={onOpen}>
        <span className="tile-title">{g.name}</span>
        <span className="tile-stat">{g.stat}</span>
        {room && (
          <span className="tile-room" role="img" aria-label="Can also be played on everyone's phones">
            <Icon.phones />
          </span>
        )}
      </button>
    );
  return (
    <button className={clsx("ticket", room && "inroom")} onClick={onOpen}>
      <span className="stub" aria-hidden="true">
        <span className="stub-no">{String(n).padStart(2, "0")}</span>
        {room && <Icon.phones />}
      </span>
      <span className="ticket-body">
        <span className="ticket-title">{g.name}</span>
        <span className="ticket-blurb">{g.blurb}</span>
        <span className="ticket-meta">
          {g.stat}
          {room && <span className="sr-only"> Can also be played in a room</span>}
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
  const mode = hasBot(players) ? botMode(g.id) : "play";
  const people = humans(players).length;
  if (mode === "people" && people < (NEEDS[g.id] ?? 2))
    return (
      <div className="screen empty">
        <h1 className="h2" tabIndex={-1}>
          {g.name} needs other people
        </h1>
        <p className="lede">
          The computer can&rsquo;t play this one because it&rsquo;s all about the people in the room. Pick another game,
          or switch to a group.
        </p>
        <div className="actions center">
          <button className="btn" onClick={() => go("/games")}>
            Pick another game
          </button>
          <button className="btn ghost" onClick={() => go("/who")}>
            Change who&rsquo;s playing
          </button>
        </div>
      </div>
    );
  if (mode === "play" && g.minPlayers && players.length < g.minPlayers)
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
    <GameFrame title={g.name} how={g.how} scores={g.scores !== false && mode !== "solo"}>
      {mode === "play" ? (
        <g.Play />
      ) : (
        <WithPlayers filter={humans}>
          <g.Play />
        </WithPlayers>
      )}
    </GameFrame>
  );
}
