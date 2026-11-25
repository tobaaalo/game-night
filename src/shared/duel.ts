// Head to head games for two. Pure rules, used by the server, the phones and the computer opponent.
// Tic-Tac-Toe, Connect Four, Dots and Boxes, Rock Paper Scissors and Battleship.

export type DuelGame = "ttt" | "c4" | "dots" | "rps" | "ship";
export type Side = 0 | 1;
export type Rnd = () => number;

export const SHIP_N = 6;
export const SHIP_LENS = [3, 2, 2];
export const C4_COLS = 7;
export const C4_ROWS = 6;
export const DOT_BOXES = 4;
/** Horizontal edges first (5 rows of 4), then vertical edges (4 rows of 5). */
export const DOT_H = (DOT_BOXES + 1) * DOT_BOXES;
export const DOT_EDGES = DOT_H * 2;

export interface Duel {
  game: DuelGame;
  /** Whose move it is. Rock Paper Scissors and the Battleship set-up are played at the same time, so it is ignored there. */
  turn: Side;
  /** Who moved first this game. */
  first: Side;
  /** Tic-Tac-Toe 9 cells, Connect Four 42 cells, Dots and Boxes 16 boxes. 0 empty, 1 first player, 2 second player. */
  b: number[];
  /** Dots and Boxes: the edges drawn so far (0 none, 1 or 2 for who drew it). */
  e: number[];
  /** Rock Paper Scissors: each side's throw (0 rock, 1 paper, 2 scissors). -1 not thrown yet. In a view, 9 means "thrown but hidden". */
  pick: [number, number];
  /** Battleship: each side's fleet. 0 is water, 1 to 3 is a ship. */
  fleet: [number[], number[]];
  /** Battleship: shots fired AT fleet[side]. 0 untouched, 1 miss, 2 hit. */
  shots: [number[], number[]];
  ready: [boolean, boolean];
  placing: boolean;
  over: boolean;
  /** The side that won. -1 means a draw (in Rock Paper Scissors, a tied throw). */
  winner: -1 | 0 | 1;
  /** Cells to highlight: the winning line, or the last move. */
  line: number[];
  last: number;
  /** One line about what just happened. */
  note: string;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
export const GAME_NAMES: Record<DuelGame, string> = {
  ttt: "Tic-Tac-Toe",
  c4: "Connect Four",
  dots: "Dots and Boxes",
  rps: "Rock Paper Scissors",
  ship: "Battleship",
};

/* ---------------------------------------------------------------- New game */

export function duelNew(game: DuelGame, first: Side, rnd: Rnd = Math.random): Duel {
  const d: Duel = {
    game,
    turn: first,
    first,
    b: new Array(
      game === "ttt" ? 9 : game === "c4" ? C4_COLS * C4_ROWS : game === "dots" ? DOT_BOXES * DOT_BOXES : 0,
    ).fill(0),
    e: game === "dots" ? new Array(DOT_EDGES).fill(0) : [],
    pick: [-1, -1],
    fleet: [[], []],
    shots: [[], []],
    ready: [false, false],
    placing: false,
    over: false,
    winner: -1,
    line: [],
    last: -1,
    note: "",
  };
  if (game === "ship") {
    d.placing = true;
    d.fleet = [placeFleet(rnd), placeFleet(rnd)];
    d.shots = [new Array(SHIP_N * SHIP_N).fill(0), new Array(SHIP_N * SHIP_N).fill(0)];
  }
  return d;
}

/** Random fleet with no overlaps. */
export function placeFleet(rnd: Rnd): number[] {
  for (;;) {
    const f = new Array(SHIP_N * SHIP_N).fill(0);
    let ok = true;
    SHIP_LENS.forEach((len, k) => {
      if (!ok) return;
      for (let tries = 0; tries < 200; tries++) {
        const horiz = rnd() < 0.5;
        const r = Math.floor(rnd() * (horiz ? SHIP_N : SHIP_N - len + 1));
        const c = Math.floor(rnd() * (horiz ? SHIP_N - len + 1 : SHIP_N));
        const cells = Array.from({ length: len }, (_, i) => (horiz ? r * SHIP_N + c + i : (r + i) * SHIP_N + c));
        if (cells.every((x) => f[x] === 0)) {
          cells.forEach((x) => (f[x] = k + 1));
          return;
        }
      }
      ok = false;
    });
    if (ok) return f;
  }
}

/* ----------------------------------------------------------------- Helpers */

const TTT_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function tttWinner(b: number[]): { w: 0 | 1 | -1; line: number[] } {
  for (const l of TTT_LINES)
    if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { w: (b[l[0]] - 1) as Side, line: l };
  return { w: -1, line: [] };
}

/** The lowest free cell in a Connect Four column, or -1 when the column is full. */
export function c4Drop(b: number[], col: number): number {
  for (let r = C4_ROWS - 1; r >= 0; r--) if (b[r * C4_COLS + col] === 0) return r * C4_COLS + col;
  return -1;
}

export function c4Winner(b: number[]): { w: 0 | 1 | -1; line: number[] } {
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= C4_ROWS || c >= C4_COLS ? -1 : b[r * C4_COLS + c]);
  for (let r = 0; r < C4_ROWS; r++)
    for (let c = 0; c < C4_COLS; c++) {
      const v = at(r, c);
      if (!v) continue;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ]) {
        const line = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
        if (line.every(([rr, cc]) => at(rr, cc) === v))
          return { w: (v - 1) as Side, line: line.map(([rr, cc]) => rr * C4_COLS + cc) };
      }
    }
  return { w: -1, line: [] };
}

/** The four edges around a box. */
export function boxEdges(box: number): number[] {
  const r = Math.floor(box / DOT_BOXES);
  const c = box % DOT_BOXES;
  return [
    r * DOT_BOXES + c,
    (r + 1) * DOT_BOXES + c,
    DOT_H + r * (DOT_BOXES + 1) + c,
    DOT_H + r * (DOT_BOXES + 1) + c + 1,
  ];
}
/** Boxes that touch an edge. */
export function edgeBoxes(edge: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < DOT_BOXES * DOT_BOXES; b++) if (boxEdges(b).includes(edge)) out.push(b);
  return out;
}
const boxSides = (e: number[], box: number) => boxEdges(box).filter((x) => e[x]).length;

const rpsBeats = (a: number, b: number) => (a - b + 3) % 3 === 1; // paper (1) beats rock (0), scissors (2) beats paper (1), rock beats scissors
export const RPS_NAMES = ["Rock", "Paper", "Scissors"];

const shipCells = (f: number[], k: number) => f.reduce<number[]>((a, v, i) => (v === k ? [...a, i] : a), []);

/* -------------------------------------------------------------------- Moves */

/** Plays a move for one side. Returns an error message, or "" when it worked. */
export function duelMove(d: Duel, side: Side, i: number): string {
  if (d.over) return "This game is over.";
  if (!Number.isInteger(i)) return "That isn't a move.";
  if (d.game === "rps") {
    if (i < 0 || i > 2) return "Pick rock, paper or scissors.";
    if (d.pick[side] !== -1) return "You have already picked.";
    d.pick[side] = i;
    if (d.pick[0] !== -1 && d.pick[1] !== -1) {
      const [a, b] = d.pick;
      d.over = true;
      d.winner = a === b ? -1 : rpsBeats(a, b) ? 0 : 1;
      d.note =
        a === b
          ? "Same pick. Go again."
          : `${RPS_NAMES[d.winner === 0 ? a : b]} beats ${RPS_NAMES[d.winner === 0 ? b : a].toLowerCase()}.`;
    }
    return "";
  }
  if (d.game === "ship" && d.placing) return "Get your fleet ready first.";
  if (d.turn !== side) return "It's not your turn.";

  if (d.game === "ttt") {
    if (i < 0 || i > 8 || d.b[i]) return "That square is taken.";
    d.b[i] = side + 1;
    d.last = i;
    const w = tttWinner(d.b);
    if (w.w !== -1) {
      d.over = true;
      d.winner = w.w;
      d.line = w.line;
    } else if (d.b.every(Boolean)) d.over = true;
    else d.turn = other(side);
    return "";
  }

  if (d.game === "c4") {
    if (i < 0 || i >= C4_COLS) return "Pick a column.";
    const cell = c4Drop(d.b, i);
    if (cell < 0) return "That column is full.";
    d.b[cell] = side + 1;
    d.last = cell;
    const w = c4Winner(d.b);
    if (w.w !== -1) {
      d.over = true;
      d.winner = w.w;
      d.line = w.line;
    } else if (d.b.every(Boolean)) d.over = true;
    else d.turn = other(side);
    return "";
  }

  if (d.game === "dots") {
    if (i < 0 || i >= DOT_EDGES || d.e[i]) return "That line is already drawn.";
    d.e[i] = side + 1;
    d.last = i;
    let got = 0;
    for (const bx of edgeBoxes(i)) {
      if (!d.b[bx] && boxEdges(bx).every((x) => d.e[x])) {
        d.b[bx] = side + 1;
        got++;
      }
    }
    d.note = got ? `${got === 1 ? "A box" : "Two boxes"}! Go again.` : "";
    if (d.b.every(Boolean)) {
      d.over = true;
      const a = d.b.filter((x) => x === 1).length;
      const z = d.b.filter((x) => x === 2).length;
      d.winner = a === z ? -1 : a > z ? 0 : 1;
    } else if (!got) d.turn = other(side);
    return "";
  }

  // Battleship
  if (i < 0 || i >= SHIP_N * SHIP_N) return "Pick a square.";
  const foe = other(side);
  if (d.shots[foe][i]) return "You already fired there.";
  const k = d.fleet[foe][i];
  d.shots[foe][i] = k ? 2 : 1;
  d.last = i;
  if (k) {
    const sunk = shipCells(d.fleet[foe], k).every((x) => d.shots[foe][x] === 2);
    d.note = sunk ? "Hit and sunk!" : "Hit!";
    if (d.fleet[foe].every((v, x) => !v || d.shots[foe][x] === 2)) {
      d.over = true;
      d.winner = side;
      return "";
    }
  } else d.note = "Miss.";
  d.turn = foe;
  return "";
}

/** Battleship: pick a new random fleet before you are ready. */
export function duelShuffle(d: Duel, side: Side, rnd: Rnd = Math.random): string {
  if (d.game !== "ship" || !d.placing || d.over) return "Not now.";
  if (d.ready[side]) return "You are already ready.";
  d.fleet[side] = placeFleet(rnd);
  return "";
}

/** Battleship: ready to fire. The game starts when both sides are ready. */
export function duelReady(d: Duel, side: Side): string {
  if (d.game !== "ship" || !d.placing || d.over) return "Not now.";
  d.ready[side] = true;
  if (d.ready[0] && d.ready[1]) {
    d.placing = false;
    d.turn = d.first;
  }
  return "";
}

/* -------------------------------------------------------------- What you see */

/** A copy of the game with the other side's secrets taken out. `viewer` is null for someone just watching. */
export function duelView(d: Duel, viewer: Side | null): Duel {
  const v: Duel = JSON.parse(JSON.stringify(d));
  if (d.game === "rps" && !d.over) {
    v.pick = [0, 1].map((s) => (d.pick[s as Side] === -1 ? -1 : s === viewer ? d.pick[s as Side] : 9)) as [
      number,
      number,
    ];
  }
  if (d.game === "ship") {
    const empty = new Array(SHIP_N * SHIP_N).fill(0);
    v.fleet = [0, 1].map((s) => (d.over || s === viewer ? d.fleet[s] : empty)) as [number[], number[]];
  }
  return v;
}

/* -------------------------------------------------------- The computer plays */

function legalMoves(d: Duel): number[] {
  if (d.game === "ttt") return d.b.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  if (d.game === "c4") return Array.from({ length: C4_COLS }, (_, c) => c).filter((c) => c4Drop(d.b, c) >= 0);
  if (d.game === "dots") return d.e.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  return [];
}

const clone = (d: Duel): Duel => JSON.parse(JSON.stringify(d));
const pickOne = <T>(a: T[], rnd: Rnd): T => a[Math.floor(rnd() * a.length)];

/** Perfect play for Tic-Tac-Toe. `turn` is who moves next on board `b`; the score is for `me`. */
function tttScore(b: number[], turn: Side, me: Side, depth: number): number {
  const w = tttWinner(b);
  if (w.w !== -1) return w.w === me ? 10 - depth : depth - 10;
  if (b.every(Boolean)) return 0;
  let best = turn === me ? -99 : 99;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn + 1;
    const s = tttScore(b, other(turn), me, depth + 1);
    b[i] = 0;
    best = turn === me ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

function c4Heuristic(b: number[], me: number): number {
  let s = 0;
  const at = (r: number, c: number) => b[r * C4_COLS + c];
  for (let r = 0; r < C4_ROWS; r++)
    for (let c = 0; c < C4_COLS; c++)
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ]) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || er >= C4_ROWS || ec < 0 || ec >= C4_COLS) continue;
        let mine = 0;
        let theirs = 0;
        for (let k = 0; k < 4; k++) {
          const v = at(r + dr * k, c + dc * k);
          if (v === me) mine++;
          else if (v) theirs++;
        }
        if (mine && theirs) continue;
        if (mine) s += [0, 1, 6, 30, 0][mine];
        if (theirs) s -= [0, 1, 6, 40, 0][theirs];
      }
  for (let r = 0; r < C4_ROWS; r++) if (at(r, 3) === me) s += 3;
  return s;
}

function c4Search(d: Duel, me: Side, depth: number, alpha: number, beta: number): number {
  const w = c4Winner(d.b);
  if (w.w !== -1) return w.w === me ? 100000 + depth : -100000 - depth;
  const moves = legalMoves(d);
  if (!moves.length) return 0;
  if (depth === 0) return c4Heuristic(d.b, me + 1);
  const turn = d.turn;
  const order = [...moves].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));
  if (turn === me) {
    let best = -Infinity;
    for (const m of order) {
      const n = clone(d);
      duelMove(n, turn, m);
      best = Math.max(best, c4Search(n, me, depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of order) {
    const n = clone(d);
    duelMove(n, turn, m);
    best = Math.min(best, c4Search(n, me, depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

/** Boxes that the next person to move could grab straight away. */
const grabbable = (e: number[], b: number[]) =>
  b.map((x, i) => (!x && boxSides(e, i) === 3 ? i : -1)).filter((i) => i >= 0);

function dotsPick(d: Duel, skill: number, rnd: Rnd): number {
  const free = legalMoves(d);
  const takes = free.filter((m) => edgeBoxes(m).some((bx) => !d.b[bx] && boxSides(d.e, bx) === 3));
  if (takes.length && (skill > 1 || rnd() < 0.6)) return pickOne(takes, rnd);
  if (skill === 1) return pickOne(free, rnd);
  // Safe lines do not give the other side a third edge.
  const safe = free.filter((m) => edgeBoxes(m).every((bx) => d.b[bx] || boxSides(d.e, bx) < 2));
  if (safe.length) return pickOne(safe, rnd);
  if (skill === 2) return pickOne(free, rnd);
  // Hard: when every line gives something away, give away the least.
  let best = free[0];
  let bestGive = Infinity;
  for (const m of free) {
    const n = clone(d);
    n.e[m] = 1;
    for (const bx of edgeBoxes(m)) if (!n.b[bx] && boxEdges(bx).every((x) => n.e[x])) n.b[bx] = 1;
    let give = 0;
    for (;;) {
      const g = grabbable(n.e, n.b);
      if (!g.length) break;
      give += g.length;
      const bx = g[0];
      const edge = boxEdges(bx).find((x) => !n.e[x]) as number;
      n.e[edge] = 2;
      for (const y of edgeBoxes(edge)) if (!n.b[y] && boxEdges(y).every((x) => n.e[x])) n.b[y] = 2;
    }
    if (give < bestGive || (give === bestGive && rnd() < 0.3)) {
      best = m;
      bestGive = give;
    }
  }
  return best;
}

function shipPick(d: Duel, side: Side, skill: number, rnd: Rnd): number {
  const foe = other(side);
  const sh = d.shots[foe];
  const free = sh.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  if (skill === 1) return pickOne(free, rnd);
  // Finish off a ship that was hit: try the squares next to the hits.
  const hits = sh.map((x, i) => (x === 2 ? i : -1)).filter((i) => i >= 0);
  const live = hits.filter((h) => {
    const k = d.fleet[foe][h];
    return !shipCells(d.fleet[foe], k).every((x) => sh[x] === 2);
  });
  const near = new Set<number>();
  for (const h of live) {
    const r = Math.floor(h / SHIP_N);
    const c = h % SHIP_N;
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < SHIP_N && cc >= 0 && cc < SHIP_N && !sh[rr * SHIP_N + cc]) near.add(rr * SHIP_N + cc);
    }
  }
  if (near.size) {
    const list = [...near];
    if (skill === 3 && live.length > 1) {
      // Two hits in a line: keep going along the line.
      const [a, b] = live;
      const step = b - a;
      const along = list.filter((x) => x === b + step || x === a - step);
      if (along.length) return pickOne(along, rnd);
    }
    return pickOne(list, rnd);
  }
  if (skill === 3) {
    const parity = free.filter((i) => (Math.floor(i / SHIP_N) + (i % SHIP_N)) % 2 === 0);
    if (parity.length) return pickOne(parity, rnd);
  }
  return pickOne(free, rnd);
}

/** The computer's move. `skill` is 1 easy, 2 medium, 3 hard. */
export function duelBot(d: Duel, side: Side, skill: 1 | 2 | 3, rnd: Rnd = Math.random): number {
  if (d.game === "rps") return Math.floor(rnd() * 3);
  if (d.game === "ship") return shipPick(d, side, skill, rnd);
  if (d.game === "dots") return dotsPick(d, skill, rnd);
  const moves = legalMoves(d);
  if (d.game === "ttt") {
    const mistake = [0.5, 0.2, 0][skill - 1];
    if (rnd() < mistake) return pickOne(moves, rnd);
    if (moves.length === 9) return pickOne([0, 2, 4, 6, 8], rnd);
    let best = -99;
    let pool: number[] = [];
    for (const m of moves) {
      const b = [...d.b];
      b[m] = side + 1;
      const s = tttScore(b, other(side), side, 1);
      if (s > best) {
        best = s;
        pool = [m];
      } else if (s === best) pool.push(m);
    }
    return pickOne(pool, rnd);
  }
  // Connect Four
  const mistake = [0.35, 0.1, 0][skill - 1];
  const depth = [2, 4, 6][skill - 1];
  // Always take a win, and always block one, unless playing on easy.
  if (skill > 1 || rnd() < 0.5) {
    for (const who of [side, other(side)]) {
      for (const m of moves) {
        const n = clone(d);
        n.turn = who;
        duelMove(n, who, m);
        if (n.over && n.winner === who) return m;
      }
    }
  }
  if (rnd() < mistake) return pickOne(moves, rnd);
  let best = -Infinity;
  let pool: number[] = [];
  for (const m of moves) {
    const n = clone(d);
    duelMove(n, side, m);
    const s = c4Search(n, side, depth - 1, -Infinity, Infinity);
    if (s > best) {
      best = s;
      pool = [m];
    } else if (s === best) pool.push(m);
  }
  return pickOne(pool, rnd);
}

/* ------------------------------------------------------------------- Match */

/** A match is a few games in a row. The first side to win more than half takes it. */
export interface Match {
  game: DuelGame;
  /** Games in the match: 1, 3 or 5. */
  best: number;
  /** Wins that settle the match. */
  need: number;
  /** Player ids (or names) for side 0 and side 1. */
  sides: [string, string];
  wins: [number, number];
  /** Games finished. A tied Rock Paper Scissors throw does not count. */
  played: number;
  counted: boolean;
  done: boolean;
  duel: Duel;
}

export function matchNew(
  game: DuelGame,
  best: number,
  sides: [string, string],
  first: Side,
  rnd: Rnd = Math.random,
): Match {
  return {
    game,
    best,
    need: Math.floor(best / 2) + 1,
    sides,
    wins: [0, 0],
    played: 0,
    counted: false,
    done: false,
    duel: duelNew(game, first, rnd),
  };
}

/** Call after every change. Tallies a finished game once and tells you who won it. */
export function matchSettle(m: Match, score: (side: Side) => void): void {
  const d = m.duel;
  if (!d.over || m.counted) return;
  m.counted = true;
  if (d.winner !== -1) {
    m.wins[d.winner]++;
    score(d.winner);
  }
  if (!(d.game === "rps" && d.winner === -1)) m.played++;
  if (m.wins[0] >= m.need || m.wins[1] >= m.need || m.played >= m.best) m.done = true;
}

/** Starts the next game of the match. Nothing happens if the match is over. */
export function matchNext(m: Match, rnd: Rnd = Math.random): boolean {
  if (!m.duel.over || m.done) return false;
  m.duel = duelNew(m.game, other(m.duel.first), rnd);
  m.counted = false;
  return true;
}

/** Who won the match: 0, 1, or -1 for level. */
export const matchWinner = (m: Match): Side | -1 => (m.wins[0] > m.wins[1] ? 0 : m.wins[1] > m.wins[0] ? 1 : -1);

/** What a phone gets: the match with the secrets of the other side taken out. */
export function matchView(m: Match, viewer: Side | null): Match {
  return { ...m, duel: duelView(m.duel, viewer) };
}
