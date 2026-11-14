import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Icon } from "../components/ui";
import { nameOf, uid, useApp, type Group } from "../lib/app";
import { GAMES } from "../games/registry";
import { FACES } from "../content";

export function Welcome() {
  const { go, setOnboarded } = useApp();
  return (
    <div className="screen welcome">
      <div className="welcome-stage stagger">
        <p className="eyebrow">Tonight&rsquo;s entertainment</p>
        <div className="logo-lockup marquee live">
          <h1 className="logo-word" tabIndex={-1}>
            Game<span>Night</span>
          </h1>
        </div>
        <p className="lede welcome-lede">
          Party games for the two of you, or the whole crew. One phone passed round, or everyone on their own.
        </p>
        <ul className="welcome-points" aria-label="What's inside">
          <li>
            <b>{GAMES.length}</b> games
          </li>
          <li>
            <b>{FACES.length}</b> famous faces
          </li>
          <li>
            <b>0</b> accounts needed
          </li>
        </ul>
      </div>
      <div className="dock">
        <button
          className="btn block"
          onClick={() => {
            setOnboarded();
            go("/who");
          }}
        >
          Let&rsquo;s play
        </button>
        <p className="hint center-text" style={{ marginTop: 10 }}>
          Got a code from a friend?{" "}
          <button className="link" onClick={() => go("/join")}>
            Join their room
          </button>
        </p>
      </div>
    </div>
  );
}

export function Who() {
  const { go, setGroup, group } = useApp();
  const pickGroup = (g: Group) => {
    setGroup(g);
    go("/names");
  };
  return (
    <div className="screen">
      <div className="stagger">
        <p className="eyebrow">Step 1 of 2</p>
        <h1 className="h1" tabIndex={-1}>
          Who&rsquo;s playing tonight?
        </h1>
      </div>
      <div className="doors stagger">
        <button className={clsx("door couple", group === "couple" && "last")} onClick={() => pickGroup("couple")}>
          <span className="door-art" aria-hidden="true">
            <span className="heart">♥</span>
          </span>
          <span className="door-title">Just the two of us</span>
          <span className="door-sub">Date-night quizzes, deep questions and how-well-do-you-know-me.</span>
        </button>
        <button className={clsx("door friends", group === "friends" && "last")} onClick={() => pickGroup("friends")}>
          <span className="door-art" aria-hidden="true">
            <Icon.people />
          </span>
          <span className="door-title">Friends are here</span>
          <span className="door-sub">
            Charades, quizzes on everyone&rsquo;s phones, and who&rsquo;s-most-likely-to.
          </span>
        </button>
      </div>
    </div>
  );
}

export function Names() {
  const { group, players, setPlayers, go, toast } = useApp();
  const couple = group === "couple";
  const [err, setErr] = useState("");
  const lastAdded = useRef<string | null>(null);
  useEffect(() => {
    if (!group) go("/who", { replace: true });
  }, [group, go]);
  useEffect(() => {
    if (lastAdded.current) document.getElementById(`p-${lastAdded.current}`)?.focus();
    lastAdded.current = null;
  }, [players.length]);
  const update = (id: string, name: string) => {
    setErr("");
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));
  };
  const add = () => {
    const id = uid();
    lastAdded.current = id;
    setPlayers((ps) => [...ps, { id, name: "", score: 0 }]);
  };
  const removeP = (id: string) => {
    const snapshot = players;
    const i = players.findIndex((p) => p.id === id);
    setPlayers((ps) => ps.filter((p) => p.id !== id));
    toast(`Removed ${nameOf(players[i], i)}.`, () => setPlayers(snapshot));
  };
  const submit = () => {
    const names = players.map((p, i) => nameOf(p, i).toLowerCase());
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) return setErr(`Two players are called "${dup}". Add an initial so the scores don't get mixed up.`);
    setPlayers((ps) => ps.map((p) => ({ ...p, name: p.name.trim() })));
    go("/games");
  };
  return (
    <form
      className="screen"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="stagger">
        <p className="eyebrow">Step 2 of 2</p>
        <h1 className="h1" tabIndex={-1}>
          {couple ? "Who are the two of you?" : "Who's in?"}
        </h1>
        <p className="lede">{couple ? "Names go on the scoreboard." : "Add everyone, or play in teams. Up to 12."}</p>
      </div>
      <ol className="namelist">
        {players.map((p, i) => (
          <li key={p.id} className="namerow">
            <span className="seat" aria-hidden="true">
              {i + 1}
            </span>
            <label className="sr-only" htmlFor={`p-${p.id}`}>
              Player {i + 1} name
            </label>
            <input
              id={`p-${p.id}`}
              className="input"
              value={p.name}
              maxLength={20}
              placeholder={couple ? (i === 0 ? "e.g. Toba" : "e.g. Mimi") : `Player ${i + 1}`}
              onChange={(e) => update(p.id, e.target.value)}
              autoComplete="off"
              enterKeyHint={i === players.length - 1 ? "done" : "next"}
            />
            {!couple && players.length > 2 && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => removeP(p.id)}
                aria-label={`Remove ${nameOf(p, i)}`}
              >
                <Icon.trash />
              </button>
            )}
          </li>
        ))}
      </ol>
      {!couple && players.length < 12 && (
        <button type="button" className="btn ghost" onClick={add}>
          <Icon.plus /> Add a player
        </button>
      )}
      {err && (
        <p className="error-text" role="alert">
          {err}
        </p>
      )}
      <div className="dock">
        <button className="btn block" type="submit">
          Pick a game
        </button>
        <p className="hint center-text" style={{ marginTop: 8 }}>
          Leave a name blank and we&rsquo;ll call them Player {players.length}.
        </p>
      </div>
    </form>
  );
}
