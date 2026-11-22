import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { load, save } from "./store";

export type Group = "couple" | "friends";
export interface Player {
  id: string;
  name: string;
  score: number;
  /** 1 or 2 when playing in teams. */
  team?: 1 | 2;
  /** The computer opponent. Takes turns like a person. */
  bot?: boolean;
  /** How good the computer is: 1 easy, 2 medium, 3 hard. */
  skill?: 1 | 2 | 3;
}
export interface Toast {
  id: number;
  text: string;
  undo?: () => void;
}

interface AppCtx {
  path: string;
  go: (to: string, opts?: { replace?: boolean }) => void;
  back: (fallback?: string) => void;
  group: Group | null;
  setGroup: (g: Group) => void;
  players: Player[];
  setPlayers: (p: Player[] | ((p: Player[]) => Player[])) => void;
  award: (playerId: string, pts: number) => void;
  resetScores: () => void;
  /** Score per player when the current game started, and how many games have finished since the last reset. */
  baseline: Record<string, number>;
  markStart: () => void;
  games: number;
  countGame: () => void;
  onboarded: boolean;
  setOnboarded: () => void;
  toast: (text: string, undo?: () => void) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  online: boolean;
}

const Ctx = createContext<AppCtx | null>(null);
/** Lets a game see only some of the players (for example, the computer sits out). */
export function WithPlayers({ filter, children }: { filter: (p: Player[]) => Player[]; children: ReactNode }) {
  const c = useApp();
  const value = useMemo(() => ({ ...c, players: filter(c.players) }), [c, filter]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

export const uid = () => Math.random().toString(36).slice(2, 9);

const defaultPlayers = (g: Group): Player[] =>
  g === "couple"
    ? [
        { id: uid(), name: "", score: 0 },
        { id: uid(), name: "", score: 0 },
      ]
    : [
        { id: uid(), name: "", score: 0 },
        { id: uid(), name: "", score: 0 },
        { id: uid(), name: "", score: 0 },
      ];

export function AppProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => location.pathname);
  const [group, setGroupState] = useState<Group | null>(() => load<Group | null>("gn.group", null));
  const [players, setPlayersState] = useState<Player[]>(() => load<Player[]>("gn.players", []));
  const [onboarded, setOnb] = useState(() => load("gn.onboarded", false));
  const [baseline, setBaseline] = useState<Record<string, number>>({});
  const [games, setGames] = useState(() => load<number>("gn.games", 0));
  const pRef = useRef(players);
  pRef.current = players;
  const markStart = useCallback(() => setBaseline(Object.fromEntries(pRef.current.map((p) => [p.id, p.score]))), []);
  const countGame = useCallback(
    () =>
      setGames((g) => {
        save("gn.games", g + 1);
        return g + 1;
      }),
    [],
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const tid = useRef(0);

  useEffect(() => {
    const pop = () => setPath(location.pathname);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener("popstate", pop);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("popstate", pop);
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);

  const go = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (to === location.pathname) return;
    if (opts?.replace) history.replaceState(null, "", to);
    else history.pushState(null, "", to);
    setPath(to);
    window.scrollTo({ top: 0 });
    // Move focus to the new screen's heading for keyboard and screen-reader users
    requestAnimationFrame(() => (document.querySelector("main h1, main h2") as HTMLElement | null)?.focus?.());
  }, []);

  const back = useCallback(
    (fallback = "/games") => {
      if (history.length > 1 && history.state !== "entry") history.back();
      else go(fallback, { replace: true });
    },
    [go],
  );

  const setPlayers = useCallback((p: Player[] | ((p: Player[]) => Player[])) => {
    setPlayersState((prev) => {
      const next = typeof p === "function" ? p(prev) : p;
      save("gn.players", next);
      return next;
    });
  }, []);

  const setGroup = useCallback(
    (g: Group) => {
      setGroupState(g);
      save("gn.group", g);
      setPlayers((prev) => {
        const named = prev.filter((p) => !p.bot && p.name.trim());
        if (g === "couple")
          return named.length >= 2 ? named.slice(0, 2) : defaultPlayers(g).map((d, i) => named[i] ?? d);
        const base = named.length ? named : [];
        while (base.length < 3) base.push({ id: uid(), name: "", score: 0 });
        return base;
      });
    },
    [setPlayers],
  );

  const award = useCallback(
    (playerId: string, pts: number) =>
      setPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, score: Math.max(0, p.score + pts) } : p))),
    [setPlayers],
  );

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, undo?: () => void) => {
      const id = ++tid.current;
      setToasts((t) => [...t.slice(-2), { id, text, undo }]);
      setTimeout(() => dismiss(id), undo ? 6000 : 2600);
    },
    [dismiss],
  );

  const resetScores = useCallback(() => {
    let snapshot: Player[] = [];
    const gamesBefore = games;
    setPlayers((ps) => {
      snapshot = ps;
      return ps.map((p) => ({ ...p, score: 0 }));
    });
    setGames(0);
    save("gn.games", 0);
    setBaseline({});
    toast("Scores reset to zero.", () => {
      setPlayers(snapshot);
      setGames(gamesBefore);
      save("gn.games", gamesBefore);
    });
  }, [setPlayers, toast, games]);

  const setOnboarded = useCallback(() => {
    setOnb(true);
    save("gn.onboarded", true);
  }, []);

  const value = useMemo<AppCtx>(
    () => ({
      path,
      go,
      back,
      group,
      setGroup,
      players,
      setPlayers,
      award,
      resetScores,
      baseline,
      markStart,
      games,
      countGame,
      onboarded,
      setOnboarded,
      toast,
      toasts,
      dismiss,
      online,
    }),
    [
      path,
      go,
      back,
      group,
      setGroup,
      players,
      setPlayers,
      award,
      resetScores,
      baseline,
      markStart,
      games,
      countGame,
      onboarded,
      setOnboarded,
      toast,
      toasts,
      dismiss,
      online,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Display name with a friendly fallback ("Player 2"). */
export const nameOf = (p: Player, i: number) => p.name.trim() || `Player ${i + 1}`;
