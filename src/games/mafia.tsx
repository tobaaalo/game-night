import { useMemo, useState } from "react";
import { nameOf, useApp } from "../lib/app";
import { shuffle } from "../lib/deck";
import { Finish } from "./frame";

type Role = "mafia" | "doctor" | "detective" | "villager";
interface Seat {
  role: Role;
  alive: boolean;
}

const ROLE_NAME: Record<Role, string> = {
  mafia: "Mafia",
  doctor: "Doctor",
  detective: "Detective",
  villager: "Villager",
};
const ROLE_JOB: Record<Role, string> = {
  mafia: "Each night, pick someone to knock out. Do not get caught.",
  doctor: "Each night, pick someone to save. You can save yourself.",
  detective: "Each night, pick someone to check. You find out if they are Mafia.",
  villager: "You have no night job. Work out who the Mafia are and vote them out.",
};

/** How many of each role for this many players. */
export function rolesFor(n: number): Role[] {
  const mafia = n >= 7 ? 2 : 1;
  const out: Role[] = Array(mafia).fill("mafia");
  if (n >= 5) out.push("doctor");
  if (n >= 6) out.push("detective");
  while (out.length < n) out.push("villager");
  return shuffle(out);
}

/** "mafia" or "town" once one side has won, else "". */
export function mafiaWinner(seats: Seat[]): "" | "mafia" | "town" {
  const mafia = seats.filter((s) => s.alive && s.role === "mafia").length;
  const town = seats.filter((s) => s.alive && s.role !== "mafia").length;
  if (mafia === 0) return "town";
  if (mafia >= town) return "mafia";
  return "";
}

type Step = "deal" | "dark" | "pass" | "act" | "seen" | "morning" | "vote" | "voted" | "over";

/** Pass the phone around: everyone sees their own role, then each night everyone takes a turn so nobody knows who does what. */
export function Mafia({ onAgain }: { onAgain: () => void }) {
  const { players, award } = useApp();
  const n = players.length;
  const name = (i: number) => nameOf(players[i], i);
  const [seats, setSeats] = useState<Seat[]>(() => rolesFor(n).map((role) => ({ role, alive: true })));
  const [step, setStep] = useState<Step>("deal");
  const [pos, setPos] = useState(0); // whose turn it is (deal and night)
  const [shown, setShown] = useState(false);
  const [kills, setKills] = useState<number[]>([]);
  const [saved, setSaved] = useState(-1);
  const [peek, setPeek] = useState<{ who: number; bad: boolean } | null>(null);
  const [report, setReport] = useState("");
  const [out, setOut] = useState<number | null>(null);
  const [night, setNight] = useState(1);
  const [fin, setFin] = useState(false);
  const [games, setGames] = useState(0);
  const winner = useMemo(() => mafiaWinner(seats), [seats]);
  const alive = seats.map((s, i) => (s.alive ? i : -1)).filter((i) => i >= 0);

  const restart = () => {
    setSeats(rolesFor(n).map((role) => ({ role, alive: true })));
    setStep("deal");
    setPos(0);
    setShown(false);
    setKills([]);
    setSaved(-1);
    setPeek(null);
    setReport("");
    setOut(null);
    setNight(1);
  };
  const conclude = (s: Seat[]) => {
    const w = mafiaWinner(s);
    if (!w) return false;
    s.forEach((seat, i) => {
      if ((w === "mafia") === (seat.role === "mafia")) award(players[i].id, 2);
    });
    setGames((g) => g + 1);
    setStep("over");
    return true;
  };

  // Moves to the next living player's night turn, or on to the morning when everyone has had one.
  const nextNight = (kill: number[], save: number) => {
    const idx = alive.indexOf(pos);
    const next = alive[idx + 1];
    setShown(false);
    setPeek(null);
    if (next !== undefined) {
      setPos(next);
      setStep("pass");
      return;
    }
    // Morning.
    const pick = kill.length ? kill[Math.floor(Math.random() * kill.length)] : -1;
    const s = seats.map((x) => ({ ...x }));
    if (pick >= 0 && pick !== save) {
      s[pick].alive = false;
      setReport(`${name(pick)} was knocked out in the night. They were a ${ROLE_NAME[s[pick].role]}.`);
    } else setReport("Nobody was knocked out last night.");
    setSeats(s);
    setStep("morning");
  };

  if (fin) return <Finish onAgain={onAgain} />;

  // ---------------------------------------------------------------- deal
  if (step === "deal") {
    const me = seats[pos];
    const mates = seats
      .map((s, i) => (s.role === "mafia" && i !== pos ? name(i) : ""))
      .filter(Boolean)
      .join(" and ");
    return (
      <div className="qcard mafia stack center-text">
        <p className="turn">{name(pos)}</p>
        {!shown ? (
          <>
            <p className="hint">Pass the phone to {name(pos)}. Everyone else, eyes away!</p>
            <button className="btn" onClick={() => setShown(true)}>
              Show my role
            </button>
          </>
        ) : (
          <>
            <p className="hint">You are the</p>
            <p className="role-name">{ROLE_NAME[me.role]}</p>
            <p className="hint">{ROLE_JOB[me.role]}</p>
            {me.role === "mafia" && (
              <p className="hint">{mates ? `The other Mafia: ${mates}.` : "You are the only Mafia."}</p>
            )}
            <button
              className="btn"
              onClick={() => {
                setShown(false);
                if (pos + 1 >= n) {
                  setPos(0);
                  setStep("dark");
                } else setPos(pos + 1);
              }}
            >
              {pos + 1 >= n ? "Everyone has seen their role" : "Hide it and pass on"}
            </button>
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- night
  if (step === "dark")
    return (
      <div className="qcard mafia stack center-text">
        <p className="turn">Night {night}</p>
        <p className="lede">The town goes to sleep. Everyone close your eyes and keep them closed.</p>
        <p className="hint">
          The phone goes around. Everyone gets a turn, even Villagers, so nobody can tell who does what.
        </p>
        <button
          className="btn"
          onClick={() => {
            setKills([]);
            setSaved(-1);
            setPos(alive[0]);
            setShown(false);
            setStep("pass");
          }}
        >
          Start the night
        </button>
      </div>
    );

  if (step === "pass")
    return (
      <div className="qcard mafia stack center-text">
        <p className="turn">{name(pos)}</p>
        <p className="hint">Pass the phone to {name(pos)}. Everyone else, eyes closed.</p>
        <button className="btn" onClick={() => setStep("act")}>
          I am {name(pos)}
        </button>
      </div>
    );

  if (step === "act" || step === "seen") {
    const me = seats[pos];
    const targets = alive.filter((i) =>
      me.role === "doctor" ? true : me.role === "mafia" ? seats[i].role !== "mafia" : i !== pos,
    );
    const finishTurn = (k: number[], s: number) => nextNight(k, s);
    if (step === "seen" && peek)
      return (
        <div className="qcard mafia stack center-text">
          <p className="turn">{name(pos)}</p>
          <p className="lede">
            {name(peek.who)} {peek.bad ? "is Mafia." : "is not Mafia."}
          </p>
          <button className="btn" onClick={() => finishTurn(kills, saved)}>
            Hide it and pass on
          </button>
        </div>
      );
    const heading =
      me.role === "mafia"
        ? "Who do you knock out?"
        : me.role === "doctor"
          ? "Who do you save?"
          : me.role === "detective"
            ? "Who do you check?"
            : "You are a Villager. Nothing happens.";
    const sub =
      me.role === "villager"
        ? "Tap anyone, so nobody can tell you are a Villager."
        : me.role === "mafia"
          ? "Pick a person. If there are two Mafia and you pick different people, one is chosen at random."
          : "Pick a person.";
    return (
      <div className="qcard mafia stack center-text">
        <p className="turn">{name(pos)}</p>
        <p className="h3">{heading}</p>
        <p className="hint">{sub}</p>
        <div className="givers" role="group" aria-label={heading}>
          {targets.map((i) => (
            <button
              key={i}
              className="btn ghost"
              onClick={() => {
                if (me.role === "mafia") {
                  const k = [...kills, i];
                  setKills(k);
                  finishTurn(k, saved);
                } else if (me.role === "doctor") {
                  setSaved(i);
                  finishTurn(kills, i);
                } else if (me.role === "detective") {
                  setPeek({ who: i, bad: seats[i].role === "mafia" });
                  setStep("seen");
                } else finishTurn(kills, saved);
              }}
            >
              {name(i)}
              {i === pos ? " (you)" : ""}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- day
  if (step === "morning")
    return (
      <div className="qcard mafia stack center-text">
        <p className="turn">Morning</p>
        <p className="lede">{report}</p>
        <p className="hint">Everyone wake up.</p>
        <button
          className="btn"
          onClick={() => {
            if (!conclude(seats)) setStep("vote");
          }}
        >
          {winner ? "See who won" : "Talk it over and vote"}
        </button>
      </div>
    );

  if (step === "vote")
    return (
      <div className="qcard mafia stack center-text">
        <p className="turn">Day {night}</p>
        <p className="h3">Who is the Mafia?</p>
        <p className="hint">Talk it over. When you agree, tap the person the town votes out.</p>
        <div className="givers" role="group" aria-label="Vote someone out">
          {alive.map((i) => (
            <button
              key={i}
              className="btn ghost"
              onClick={() => {
                const s = seats.map((x) => ({ ...x }));
                s[i].alive = false;
                setSeats(s);
                setOut(i);
                setStep("voted");
              }}
            >
              {name(i)}
            </button>
          ))}
        </div>
      </div>
    );

  if (step === "voted" && out !== null)
    return (
      <div className="qcard mafia stack center-text">
        <p className="turn">The town has voted</p>
        <p className="lede">
          {name(out)} was a {ROLE_NAME[seats[out].role]}.
        </p>
        <button
          className="btn"
          onClick={() => {
            if (conclude(seats)) return;
            setNight(night + 1);
            setStep("dark");
          }}
        >
          {mafiaWinner(seats) ? "See who won" : "Night falls again"}
        </button>
      </div>
    );

  // ---------------------------------------------------------------- over
  return (
    <div className="qcard mafia stack center-text">
      <p className="turn">{winner === "mafia" ? "The Mafia win!" : "The town wins!"}</p>
      <ul className="mafia-roles" aria-label="Who was who">
        {seats.map((s, i) => (
          <li key={i} className={s.alive ? "" : "out"}>
            <span>{name(i)}</span>
            <strong>{ROLE_NAME[s.role]}</strong>
          </li>
        ))}
      </ul>
      <div className="actions center">
        <button className="btn" onClick={restart}>
          Another game
        </button>
        {games > 0 && (
          <button className="btn ghost" onClick={() => setFin(true)}>
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
