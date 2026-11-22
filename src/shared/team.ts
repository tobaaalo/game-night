// Word Ladder for rooms. Everyone plays in a team (a team can be one person). Teammates share one board
// and see each other's moves live. Teams either race at the same time, or play one after another.
// Used by the room server (as the referee) and by the app (to draw the board).

export type Vs = "race" | "after";
export type Within = "free" | "turns";
export type Puzzle = [number, string, string, number];

export interface Board {
  /** The words so far. chain[0] is the start word. */
  chain: string[];
  /** Whose turn it is inside the team ("host" or a player id). Only used when teammates take turns. */
  turn: string;
  hintsUsed: number;
  hint?: string;
  last?: { by: string; word: string };
  /** A letter position a teammate is choosing right now, so the other phone can see it. */
  picking?: { by: string; pos: number };
  /** Words added per person on this ladder. */
  moves: Record<string, number>;
  /** wait = not this team's go yet, lost = another team finished first. */
  status: "wait" | "play" | "won" | "gave" | "lost";
  /** Goes up on every change to this board. A move sent with an old number is ignored, so quick double taps never clash.
   *  Other teams' moves never change it, so a race is never affected by what the other side does. */
  v: number;
}

export interface TTeam {
  id: string;
  members: string[];
  score: number;
  /** Points won on the ladder just finished. */
  gained: number;
  board: Board;
}

export interface TeamState {
  vs: Vs;
  within: Within;
  puzzles: Puzzle[];
  i: number;
  teams: TTeam[];
  /** One after another: the team that is playing now. */
  active: number;
  status: "play" | "round" | "done";
  /** Who won the ladder just finished (team id), if anyone. */
  winner?: string;
  /** Plain words about how the round ended. */
  note?: string;
  rv: number;
}

export type TeamMsg =
  | { t: "team-start"; vs: Vs; within: Within; teams: number; puzzles: Puzzle[] }
  | { t: "team-move"; word: string; v: number }
  | { t: "team-undo"; v: number }
  | { t: "team-hint"; word: string; v: number }
  | { t: "team-pass"; v: number }
  | { t: "team-giveup"; v: number }
  | { t: "team-next"; rv: number }
  | { t: "team-pick"; pos: number | null };

export const TEAM_OPTIONS = {
  teams: [
    { value: 0, label: "Everyone alone", rule: "Everyone plays on their own phone with their own ladder." },
    {
      value: 2,
      label: "2 teams",
      rule: "Players are split into 2 teams. Teammates see the same ladder on their phones.",
    },
    {
      value: 3,
      label: "3 teams",
      rule: "Players are split into 3 teams. Teammates see the same ladder on their phones.",
    },
    {
      value: 4,
      label: "4 teams",
      rule: "Players are split into 4 teams. Teammates see the same ladder on their phones.",
    },
  ],
  vs: [
    {
      value: "race",
      label: "At the same time",
      rule: "Everyone gets the same ladder and races. The first to finish wins it. Nothing the others do changes your ladder.",
    },
    {
      value: "after",
      label: "One after another",
      rule: "Players or teams take it in turns to play the same ladder. Fewest moves wins the most points.",
    },
  ],
  within: [
    {
      value: "free",
      label: "Both at once",
      rule: "Teammates can all add words at any time, and you see them appear on the other phone straight away.",
    },
    {
      value: "turns",
      label: "Take turns",
      rule: "Teammates swap after every word, like passing a pen. Stuck? Tap Pass, which costs 1 point.",
    },
  ],
} as const;

const fresh = (p: Puzzle, first: string, status: Board["status"]): Board => ({
  chain: [p[1]],
  turn: first,
  hintsUsed: 0,
  moves: {},
  status,
  v: 1,
});

/** Splits everyone into teams (shuffled, so it's a surprise) and sets up the first ladder. */
export function teamStart(
  vs: Vs,
  within: Within,
  teamCount: number,
  puzzles: Puzzle[],
  people: string[],
  shuffle: (a: string[]) => string[] = (a) => a,
): TeamState {
  const order = shuffle([...people]);
  const n = teamCount <= 0 ? order.length : Math.max(1, Math.min(teamCount, order.length));
  const groups: string[][] = Array.from({ length: n }, () => []);
  order.forEach((id, i) => groups[i % n].push(id));
  const teams: TTeam[] = groups.map((members, k) => ({
    id: `t${k + 1}`,
    members,
    score: 0,
    gained: 0,
    board: fresh(puzzles[0], members[0], vs === "race" || k === 0 ? "play" : "wait"),
  }));
  return { vs, within, puzzles, i: 0, teams, active: 0, status: "play", rv: 1 };
}

export const teamOf = (t: TeamState, id: string) => t.teams.find((x) => x.members.includes(id));

const nextOf = (order: string[], by: string, here: Set<string>) => {
  const at = order.indexOf(by);
  for (let k = 1; k <= order.length; k++) {
    const id = order[(at + k) % order.length];
    if (here.has(id)) return id;
  }
  return by;
};

/** Can this person add a word right now? */
export function canMove(t: TeamState, id: string, here: Set<string>): boolean {
  const team = teamOf(t, id);
  if (!team || t.status !== "play" || team.board.status !== "play") return false;
  if (t.vs === "after" && t.teams[t.active] !== team) return false;
  if (t.within === "free" || team.members.length < 2) return true;
  return team.board.turn === id || !here.has(team.board.turn);
}

const oneLetter = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d === 1;
};

const effort = (tm: TTeam) => tm.board.chain.length - 1 + tm.board.hintsUsed;

/** Called when a team finishes (or gives up) to see whether the whole round is over. */
function settle(t: TeamState) {
  const [lv, , , par] = t.puzzles[t.i];
  if (t.vs === "race") {
    const won = t.teams.find((x) => x.board.status === "won");
    if (won) {
      won.gained = Math.max(1, 3 + (won.board.chain.length - 1 <= par ? 1 : 0) - won.board.hintsUsed);
      won.score += won.gained;
      t.winner = won.id;
      for (const x of t.teams) if (x.board.status === "play") x.board.status = "lost";
      t.status = "round";
      t.note = "First to the finish line.";
    } else if (t.teams.every((x) => x.board.status === "gave")) {
      t.status = "round";
      t.note = "Nobody finished this one.";
    }
    return;
  }
  // One after another: when the last team has had its go, rank by effort (moves plus hints).
  const next = t.active + 1;
  if (next < t.teams.length) {
    t.active = next;
    t.teams[next].board.status = "play";
    return;
  }
  const solved = t.teams.filter((x) => x.board.status === "won").sort((a, b) => effort(a) - effort(b));
  const pts = [3, 2, 1];
  let rank = 0;
  solved.forEach((x, k) => {
    if (k > 0 && effort(x) > effort(solved[k - 1])) rank = k;
    x.gained = (pts[rank] ?? 1) + (lv >= 3 ? 1 : 0);
    x.score += x.gained;
  });
  t.winner = solved[0]?.id;
  t.status = "round";
  t.note = solved.length ? "Fewest moves wins the most points." : "Nobody finished this one.";
}

/** Applies one message from `by`. Returns true if the shared state changed. */
export function teamApply(t: TeamState, m: TeamMsg, by: string, here: Set<string>): boolean {
  if (m.t === "team-start") return false;
  const team = teamOf(t, by);
  if (!team) return false;
  const b = team.board;
  if (m.t === "team-pick") {
    if (b.status !== "play") return false;
    if (m.pos === null) {
      if (b.picking?.by !== by) return false;
      b.picking = undefined;
    } else b.picking = { by, pos: m.pos };
    return true;
  }
  if (m.t === "team-next") {
    if (t.status !== "round" || m.rv !== t.rv) return false;
    if (t.i + 1 >= t.puzzles.length) {
      t.status = "done";
      t.rv++;
      return true;
    }
    t.i++;
    t.active = t.i % t.teams.length;
    t.winner = undefined;
    t.note = undefined;
    t.status = "play";
    t.teams.forEach((x, k) => {
      x.gained = 0;
      x.board = fresh(
        t.puzzles[t.i],
        x.members[t.i % x.members.length],
        t.vs === "race" || k === t.active ? "play" : "wait",
      );
    });
    t.rv++;
    return true;
  }
  if (t.status !== "play" || b.status !== "play") return false;
  if (t.vs === "after" && t.teams[t.active] !== team) return false;
  if ("v" in m && m.v !== b.v) return false;
  const goal = t.puzzles[t.i][2];
  const cur = b.chain[b.chain.length - 1];
  if (m.t === "team-move") {
    if (!canMove(t, by, here)) return false;
    const w = String(m.word).toLowerCase();
    if (!/^[a-z]+$/.test(w) || !oneLetter(cur, w) || b.chain.includes(w)) return false;
    b.chain.push(w);
    b.moves[by] = (b.moves[by] ?? 0) + 1;
    b.last = { by, word: w };
    b.hint = undefined;
    b.picking = undefined;
    if (w === goal) {
      b.status = "won";
      settle(t);
    } else if (t.within === "turns" && team.members.length > 1) b.turn = nextOf(team.members, by, here);
    b.v++;
    t.rv++;
    return true;
  }
  if (m.t === "team-undo") {
    if (b.chain.length < 2) return false;
    if (t.within === "turns" && team.members.length > 1 && b.last?.by !== by && b.turn !== by) return false;
    b.chain.pop();
    if (b.last) {
      b.moves[b.last.by] = Math.max(0, (b.moves[b.last.by] ?? 1) - 1);
      if (t.within === "turns" && team.members.length > 1) b.turn = b.last.by;
    }
    b.last = undefined;
    b.hint = undefined;
    b.picking = undefined;
    b.v++;
    t.rv++;
    return true;
  }
  if (m.t === "team-hint") {
    if (!oneLetter(cur, String(m.word).toLowerCase())) return false;
    b.hint = String(m.word).toLowerCase();
    b.hintsUsed++;
    b.v++;
    t.rv++;
    return true;
  }
  if (m.t === "team-pass") {
    if (t.within !== "turns" || team.members.length < 2 || !canMove(t, by, here)) return false;
    team.score = Math.max(0, team.score - 1);
    b.turn = nextOf(team.members, b.turn, here);
    b.picking = undefined;
    b.v++;
    t.rv++;
    return true;
  }
  if (m.t === "team-giveup") {
    b.status = "gave";
    b.picking = undefined;
    settle(t);
    b.v++;
    t.rv++;
    return true;
  }
  return false;
}
