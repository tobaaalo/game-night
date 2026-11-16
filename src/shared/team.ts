// Team Word Ladder: two or more phones share one ladder. Used by the room server (as the referee)
// and by the app (to draw the board).

export type TeamMode = "free" | "turns";
export type Puzzle = [number, string, string, number];

export interface TeamState {
  mode: TeamMode;
  puzzles: Puzzle[];
  i: number;
  /** The words so far. chain[0] is the start word. */
  chain: string[];
  /** Whose turn it is ("host" or a player id). Only used in turns mode. */
  turn: string;
  score: number;
  hintsUsed: number;
  passes: number;
  /** Words added per person this game. */
  moves: Record<string, number>;
  /** Ladders finished per person (the one who adds the last word). */
  finishes: Record<string, number>;
  status: "play" | "solved" | "gave" | "done";
  /** Points earned on the ladder just finished. */
  earned: number;
  /** Goes up on every change. Moves sent with an old number are ignored, so two quick taps never clash. */
  v: number;
  hint?: string;
  last?: { by: string; word: string };
  /** A letter position someone is choosing right now, so the other phone can see it. */
  picking?: { by: string; pos: number };
}

export type TeamMsg =
  | { t: "team-start"; mode: TeamMode; puzzles: Puzzle[] }
  | { t: "team-move"; word: string; v: number }
  | { t: "team-undo"; v: number }
  | { t: "team-hint"; word: string; v: number }
  | { t: "team-pass"; v: number }
  | { t: "team-giveup"; v: number }
  | { t: "team-next"; v: number }
  | { t: "team-pick"; pos: number | null };

export const TEAM_NAMES: Record<TeamMode, { label: string; rule: string }> = {
  free: {
    label: "Both at once",
    rule: "You both play at the same time. Anyone can add the next word, and you see it appear on the other phone straight away.",
  },
  turns: {
    label: "Take turns",
    rule: "You swap after every word, like passing a pen. Stuck? Tap Pass, which costs 1 point.",
  },
};

export function teamStart(mode: TeamMode, puzzles: Puzzle[], order: string[]): TeamState {
  return {
    mode,
    puzzles,
    i: 0,
    chain: [puzzles[0][1]],
    turn: order[0] ?? "host",
    score: 0,
    hintsUsed: 0,
    passes: 0,
    moves: {},
    finishes: {},
    status: "play",
    earned: 0,
    v: 1,
  };
}

const nextOf = (order: string[], by: string, here: Set<string>) => {
  const at = order.indexOf(by);
  for (let k = 1; k <= order.length; k++) {
    const id = order[(at + k) % order.length];
    if (here.has(id)) return id;
  }
  return by;
};

/** Everyone who can currently act, with the person whose turn it is allowed to be away. */
export const canAct = (t: TeamState, by: string, here: Set<string>) =>
  t.mode === "free" || t.turn === by || !here.has(t.turn);

const oneLetter = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d === 1;
};

/** Applies one message from `by`. Returns true if the shared state changed. */
export function teamApply(t: TeamState, m: TeamMsg, by: string, order: string[], here: Set<string>): boolean {
  if (m.t === "team-pick") {
    if (t.status !== "play") return false;
    if (m.pos === null) {
      if (t.picking?.by !== by) return false;
      t.picking = undefined;
    } else t.picking = { by, pos: m.pos };
    return true;
  }
  if (m.t === "team-start") return false;
  if (m.v !== t.v) return false;
  const [lv, start, goal, par] = t.puzzles[t.i];
  const cur = t.chain[t.chain.length - 1];
  if (m.t === "team-move") {
    if (t.status !== "play" || !canAct(t, by, here)) return false;
    const w = String(m.word).toLowerCase();
    if (!/^[a-z]+$/.test(w) || !oneLetter(cur, w) || t.chain.includes(w)) return false;
    t.chain.push(w);
    t.moves[by] = (t.moves[by] ?? 0) + 1;
    t.last = { by, word: w };
    t.hint = undefined;
    t.picking = undefined;
    if (w === goal) {
      t.status = "solved";
      t.earned = Math.max(0, lv + (t.chain.length - 1 <= par ? 1 : 0) - t.hintsUsed);
      t.score += t.earned;
      t.finishes[by] = (t.finishes[by] ?? 0) + 1;
    } else if (t.mode === "turns") t.turn = nextOf(order, by, here);
    t.v++;
    return true;
  }
  if (m.t === "team-undo") {
    if (t.status !== "play" || t.chain.length < 2) return false;
    if (t.mode === "turns" && t.last?.by !== by && t.turn !== by) return false;
    t.chain.pop();
    if (t.last) {
      t.moves[t.last.by] = Math.max(0, (t.moves[t.last.by] ?? 1) - 1);
      if (t.mode === "turns") t.turn = t.last.by;
    }
    t.last = undefined;
    t.hint = undefined;
    t.picking = undefined;
    t.v++;
    return true;
  }
  if (m.t === "team-hint") {
    if (t.status !== "play" || !oneLetter(cur, String(m.word).toLowerCase())) return false;
    t.hint = String(m.word).toLowerCase();
    t.hintsUsed++;
    t.v++;
    return true;
  }
  if (m.t === "team-pass") {
    if (t.status !== "play" || t.mode !== "turns" || !canAct(t, by, here)) return false;
    t.passes++;
    t.score = Math.max(0, t.score - 1);
    t.turn = nextOf(order, t.turn, here);
    t.picking = undefined;
    t.v++;
    return true;
  }
  if (m.t === "team-giveup") {
    if (t.status !== "play") return false;
    t.status = "gave";
    t.earned = 0;
    t.picking = undefined;
    t.v++;
    return true;
  }
  if (m.t === "team-next") {
    if (t.status !== "solved" && t.status !== "gave") return false;
    if (t.i + 1 >= t.puzzles.length) t.status = "done";
    else {
      t.i++;
      t.chain = [t.puzzles[t.i][1]];
      t.hintsUsed = 0;
      t.hint = undefined;
      t.last = undefined;
      t.earned = 0;
      t.status = "play";
      // The next ladder starts with the other person.
      if (t.mode === "turns") t.turn = nextOf(order, t.turn, here);
    }
    t.v++;
    void start;
    return true;
  }
  return false;
}
