// Live room games: the server holds one small shared state and moves it along by itself.
// Used by the Durable Object and by the phones, so the types and rules live here.

export type LiveCfg =
  /** One player acts or describes, the rest guess. Charades Sprint, Don't Say It, Charades Bingo. */
  | { kind: "perform"; items: { w: string; ban?: string[] }[]; turns: number; seconds: number; buzz: boolean }
  /** Everyone types at once, then the server scores. Name Place Animal Thing, Name 5 in 10. */
  | {
      kind: "words";
      rounds: { prompt: string; labels: string[]; letter?: string }[];
      seconds: number;
      hi: number;
      lo: number;
      pool: boolean;
    }
  /** One player says the answers out loud and taps one for each; the others can say "not valid". */
  | { kind: "shout"; prompts: string[]; seconds: number; max: number }
  | { kind: "draw"; words: string[]; seconds: number }
  | { kind: "chain"; start: string; seconds: number }
  | { kind: "memory"; symbols: string[] }
  | { kind: "knowme"; questions: string[] };

export type LiveMsg =
  | { t: "live-start"; game: string; cfg: LiveCfg }
  | { t: "live"; a: "got"; pid: string }
  | { t: "live"; a: "skip" | "buzz" | "done" | "next" | "clear" | "undo" | "lock" }
  | { t: "live"; a: "submit" | "guess" | "word" | "secret"; v: string | string[] }
  | { t: "live"; a: "stroke"; s: number[] }
  | { t: "live"; a: "flip"; i: number }
  | { t: "live"; a: "judge"; pid: string }
  | { t: "live"; a: "flag"; pid: string; i: number }
  | { t: "live"; a: "tick" | "veto" };

export interface LiveResult {
  pid: string;
  /** Words: what each slot scored. Know Me: one entry with the guess. */
  items: { t: string; p: number; bad?: boolean; flags?: number }[];
  total: number;
  ok?: boolean;
}

/** What a phone sees. Secrets (the word to act, the drawing word) only reach the person who needs them. */
export interface LiveView {
  kind: LiveCfg["kind"];
  round: number;
  rounds: number;
  step: "play" | "reveal" | "secret" | "guess" | "hide";
  /** When this step ends by itself. */
  deadline?: number;
  actor?: string;
  prompt?: string;
  labels?: string[];
  letter?: string;
  /** Only sent to the performer or drawer. */
  secret?: string;
  banned?: string[];
  tally?: number;
  buzz?: boolean;
  submitted: string[];
  guesses?: { pid: string; text: string; ok: boolean }[];
  strokes?: number[][];
  wordLen?: number;
  chain?: string[];
  out?: string[];
  board?: { cards: (string | null)[]; done: number[] };
  pairs?: Record<string, number>;
  results?: LiveResult[];
  note?: string;
  word?: string;
}

export interface Live {
  cfg: LiveCfg;
  pids: string[];
  round: number;
  rounds: number;
  step: LiveView["step"];
  at?: number;
  deadline?: number;
  actor?: string;
  prompt?: string;
  tally: number;
  wi: number;
  subs: Record<string, string[]>;
  locked: string[];
  /** "pid:slot" to the players who said that answer is not valid. */
  flags: Record<string, string[]>;
  scored: boolean;
  results?: LiveResult[];
  note?: string;
  strokes: number[][];
  word?: string;
  guesses: { pid: string; text: string; ok: boolean }[];
  guessed: string[];
  chain: string[];
  out: string[];
  cards: string[];
  up: number[];
  done: number[];
  pairs: Record<string, number>;
  secret?: string;
  names: Record<string, string>;
  /** Random first player, then everyone in turn. */
  off: number;
}

const PERFORM_REVEAL = 4000;
const WORDS_REVEAL = 22000;
const DRAW_REVEAL = 5000;
const KNOW_REVEAL = 16000;
const KNOW_SECRET = 40000;
const KNOW_GUESS = 40000;
const FLIP_BACK = 1300;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

export type Ctx = {
  now: number;
  score: (pid: string, n: number) => void;
  shuffle: <T>(a: T[]) => T[];
  /** Players who are still in the room, so a turn never waits on someone who left. */
  here: (pid: string) => boolean;
};

export function liveStart(cfg: LiveCfg, names: Record<string, string>, ctx: Ctx): Live {
  const pids = Object.keys(names);
  const l: Live = {
    cfg,
    pids,
    round: -1,
    rounds: 1,
    step: "play",
    tally: 0,
    wi: 0,
    subs: {},
    locked: [],
    flags: {},
    scored: false,
    strokes: [],
    guesses: [],
    guessed: [],
    chain: [],
    out: [],
    cards: [],
    up: [],
    done: [],
    pairs: {},
    names,
    off: Math.floor(Math.random() * Math.max(1, pids.length)),
  };
  if (cfg.kind === "perform") l.rounds = cfg.turns;
  else if (cfg.kind === "words") l.rounds = cfg.rounds.length;
  else if (cfg.kind === "draw") l.rounds = cfg.words.length;
  else if (cfg.kind === "shout") l.rounds = cfg.prompts.length;
  else if (cfg.kind === "knowme") l.rounds = cfg.questions.length;
  else if (cfg.kind === "chain") {
    l.rounds = 1;
    l.chain = [cfg.start];
    l.round = 0;
    l.actor = pids[l.off];
    l.deadline = ctx.now + cfg.seconds * 1000 + 3000;
    l.at = l.deadline;
    return l;
  } else {
    l.rounds = 1;
    l.cards = ctx.shuffle([...cfg.symbols, ...cfg.symbols]);
    l.round = 0;
    l.actor = pids[l.off];
    pids.forEach((p) => (l.pairs[p] = 0));
    return l;
  }
  nextRound(l, ctx);
  return l;
}

/** Returns true when the whole game is over. */
function nextRound(l: Live, ctx: Ctx): boolean {
  if (l.cfg.kind === "words" && l.round >= 0 && !l.scored && l.step === "reveal") {
    l.scored = true;
    scoreWords(l, l.cfg, ctx, true);
  }
  l.round++;
  if (l.round >= l.rounds) return true;
  const c = l.cfg;
  const live = l.pids.filter(ctx.here);
  const pool = live.length ? live : l.pids;
  l.actor = pool[(l.round + l.off) % pool.length];
  l.subs = {};
  l.locked = [];
  l.flags = {};
  l.scored = false;
  l.results = undefined;
  l.note = undefined;
  l.tally = 0;
  l.guesses = [];
  l.guessed = [];
  l.strokes = [];
  l.secret = undefined;
  l.step = "play";
  if (c.kind === "perform") {
    l.deadline = ctx.now + c.seconds * 1000;
    l.at = l.deadline;
  } else if (c.kind === "words") {
    l.actor = undefined;
    l.deadline = ctx.now + c.seconds * 1000;
    l.at = l.deadline;
    l.prompt = c.rounds[l.round].prompt;
  } else if (c.kind === "shout") {
    l.prompt = c.prompts[l.round];
    l.deadline = ctx.now + c.seconds * 1000;
    l.at = l.deadline;
  } else if (c.kind === "draw") {
    l.word = c.words[l.round];
    l.deadline = ctx.now + c.seconds * 1000;
    l.at = l.deadline;
  } else if (c.kind === "knowme") {
    const name = l.names[l.actor ?? ""] ?? "them";
    l.prompt = c.questions[l.round].replace(/\{n\}/g, name);
    l.step = "secret";
    l.deadline = ctx.now + KNOW_SECRET;
    l.at = l.deadline;
  }
  return false;
}

/** Answers most of the other players said were wrong. */
function removed(l: Live): Set<string> {
  const out = new Set<string>();
  const others = Math.max(1, l.pids.length - 1);
  for (const [k, who] of Object.entries(l.flags)) if (who.length * 2 > others) out.add(k);
  return out;
}

function scoreWords(l: Live, c: Extract<LiveCfg, { kind: "words" }>, ctx: Ctx, apply: boolean) {
  const rd = c.rounds[l.round];
  const gone = removed(l);
  const letter = rd.letter?.toLowerCase();
  const ok = (t: string, pid: string, slot: number) => {
    const w = t.trim();
    if (!w || w.length > 40 || gone.has(`${pid}:${slot}`)) return false;
    if (letter) {
      const first = w.toLowerCase().replace(/[^a-z]/g, "")[0];
      if (first !== letter) return false;
    }
    return true;
  };
  const key = (slot: number, t: string) => (c.pool ? norm(t) : `${slot}:${norm(t)}`);
  const count = new Map<string, number>();
  const mine: Record<string, Set<string>> = {};
  for (const pid of l.pids) {
    mine[pid] = new Set();
    (l.subs[pid] ?? []).forEach((t, i) => {
      if (!ok(t, pid, i)) return;
      const k = key(i, t);
      if (mine[pid].has(k)) return;
      mine[pid].add(k);
      count.set(k, (count.get(k) ?? 0) + 1);
    });
  }
  const res: LiveResult[] = [];
  for (const pid of l.pids) {
    const seen = new Set<string>();
    const items: LiveResult["items"] = [];
    let total = 0;
    for (let i = 0; i < rd.labels.length; i++) {
      const t = (l.subs[pid] ?? [])[i] ?? "";
      if (!t.trim()) {
        items.push({ t: "", p: 0 });
        continue;
      }
      const k = key(i, t);
      const fl = l.flags[`${pid}:${i}`]?.length ?? 0;
      if (!ok(t, pid, i) || seen.has(k)) {
        items.push({ t: t.trim(), p: 0, bad: true, flags: fl });
        continue;
      }
      seen.add(k);
      const p = (count.get(k) ?? 1) > 1 ? c.lo : c.hi;
      items.push({ t: t.trim(), p, flags: fl });
      total += p;
    }
    if (apply && total) ctx.score(pid, total);
    res.push({ pid, items, total });
  }
  l.results = res;
}

function enterReveal(l: Live, ctx: Ctx): void {
  const c = l.cfg;
  l.step = "reveal";
  l.deadline = undefined;
  if (c.kind === "perform") {
    l.note = `${l.names[l.actor ?? ""] ?? "They"} got ${l.tally}.`;
    l.at = ctx.now + PERFORM_REVEAL;
  } else if (c.kind === "words") {
    scoreWords(l, c, ctx, false);
    l.at = ctx.now + WORDS_REVEAL;
  } else if (c.kind === "shout") {
    const n = Math.max(0, l.tally);
    const bonus = n >= c.max ? 2 : 0;
    if (l.actor) ctx.score(l.actor, n * 2 + bonus);
    l.note = `${l.names[l.actor ?? ""] ?? "They"} got ${n} of ${c.max}${bonus ? ". Full house, +2 bonus!" : "."}`;
    l.at = ctx.now + PERFORM_REVEAL;
  } else if (c.kind === "draw") {
    l.note = `The word was ${l.word}.`;
    l.at = ctx.now + DRAW_REVEAL;
  } else if (c.kind === "knowme") {
    const secret = norm(l.secret ?? "");
    const res: LiveResult[] = [];
    for (const pid of l.pids) {
      if (pid === l.actor) continue;
      const g = (l.subs[pid] ?? [""])[0] ?? "";
      const n = norm(g);
      const ok = !!secret && n.length >= 2 && (n === secret || (n.length >= 3 && (secret.includes(n) || n.includes(secret))));
      if (ok) {
        ctx.score(pid, 100);
        if (l.actor) ctx.score(l.actor, 50);
      }
      res.push({ pid, items: [{ t: g.trim(), p: ok ? 100 : 0 }], total: ok ? 100 : 0, ok });
    }
    l.results = res;
    l.note = l.secret ? undefined : "No answer was typed this round.";
    l.at = ctx.now + KNOW_REVEAL;
  }
}

/** The alarm fired: move the game on. Returns true when the game is over. */
export function liveStep(l: Live, ctx: Ctx): boolean {
  l.at = undefined;
  const c = l.cfg;
  if (c.kind === "chain") {
    if (l.actor) l.out.push(l.actor);
    const alive = l.pids.filter((p) => !l.out.includes(p));
    if (l.pids.length === 1 || alive.length <= 1) {
      if (alive[0] && l.pids.length > 1) ctx.score(alive[0], 3);
      return true;
    }
    pickChainActor(l, ctx);
    return false;
  }
  if (c.kind === "memory") {
    if (l.step === "hide") {
      l.up = [];
      l.step = "play";
      l.actor = nextMem(l, ctx);
    }
    return false;
  }
  if (l.step === "reveal") return nextRound(l, ctx);
  if (c.kind === "knowme" && l.step === "secret") {
    if (!l.secret) {
      enterReveal(l, ctx);
      return false;
    }
    l.step = "guess";
    l.deadline = ctx.now + KNOW_GUESS;
    l.at = l.deadline;
    return false;
  }
  enterReveal(l, ctx);
  return false;
}

function pickChainActor(l: Live, ctx: Ctx) {
  const n = l.pids.length;
  const from = Math.max(0, l.pids.indexOf(l.actor ?? ""));
  for (let k = 1; k <= n; k++) {
    const p = l.pids[(from + k) % n];
    if (!l.out.includes(p)) {
      l.actor = p;
      break;
    }
  }
  const c = l.cfg as Extract<LiveCfg, { kind: "chain" }>;
  l.deadline = ctx.now + c.seconds * 1000;
  l.at = l.deadline;
}
function nextMem(l: Live, ctx: Ctx) {
  const pool = l.pids.filter(ctx.here);
  const list = pool.length ? pool : l.pids;
  const i = list.indexOf(l.actor ?? "");
  return list[(i + 1) % list.length];
}

export type Applied = { error?: string; end?: boolean; changed?: boolean };

/** One move from a phone. */
export function liveApply(l: Live, m: LiveMsg, who: string, isHost: boolean, ctx: Ctx): Applied {
  if (m.t !== "live") return {};
  const c = l.cfg;
  const isActor = who === l.actor;
  const player = l.pids.includes(who);
  const finishEarly = () => {
    l.at = Math.min(l.at ?? Infinity, ctx.now + 1500);
  };

  if (m.a === "next") {
    if (l.step !== "reveal") return {};
    if (c.kind === "knowme" && !isActor && !isHost) return {};
    return { end: nextRound(l, ctx), changed: true };
  }

  if (c.kind === "perform") {
    if (l.step !== "play") return {};
    if (m.a === "got" && isActor) {
      if (m.pid === who || !l.pids.includes(m.pid)) return { error: "Pick who guessed it." };
      ctx.score(who, 1);
      ctx.score(m.pid, 1);
      l.tally++;
      l.wi++;
      return { changed: true };
    }
    if (m.a === "skip" && isActor) {
      l.wi++;
      return { changed: true };
    }
    if (m.a === "buzz" && c.buzz && player && !isActor) {
      ctx.score(l.actor ?? "", -1);
      l.wi++;
      l.note = `${l.names[who] ?? "Someone"} buzzed.`;
      return { changed: true };
    }
    if (m.a === "done" && isActor) {
      l.at = ctx.now;
      return { changed: true };
    }
    return {};
  }

  if (c.kind === "shout") {
    if (l.step !== "play") return {};
    if (m.a === "tick" && isActor) {
      if (l.tally >= c.max) return {};
      l.tally++;
      if (l.tally >= c.max) l.at = ctx.now + 800;
      return { changed: true };
    }
    if (m.a === "veto" && player && !isActor) {
      const used = l.guessed.filter((p) => p === who).length;
      if (l.tally > 0 && used < c.max) {
        l.tally--;
        l.guessed.push(who);
        l.note = `${l.names[who] ?? "Someone"} said that one was not valid.`;
        return { changed: true };
      }
      return {};
    }
    if (m.a === "done" && isActor) {
      l.at = ctx.now;
      return { changed: true };
    }
    return {};
  }
  if (c.kind === "words" && m.a === "flag") {
    if (l.step !== "reveal" || !player || m.pid === who) return {};
    const k = `${m.pid}:${m.i}`;
    const arr = (l.flags[k] ??= []);
    const at = arr.indexOf(who);
    if (at >= 0) arr.splice(at, 1);
    else arr.push(who);
    scoreWords(l, c, ctx, false);
    return { changed: true };
  }
  if (c.kind === "words") {
    if (l.step !== "play" || !player) return {};
    if (m.a === "submit") {
      const arr = (Array.isArray(m.v) ? m.v : [m.v]).map((x) => String(x).slice(0, 60));
      l.subs[who] = arr.slice(0, 8);
      return { changed: false };
    }
    if (m.a === "lock") {
      if (!l.locked.includes(who)) l.locked.push(who);
      if (l.pids.filter(ctx.here).every((p) => l.locked.includes(p))) finishEarly();
      return { changed: true };
    }
    return {};
  }

  if (c.kind === "draw") {
    if (l.step !== "play") return {};
    if (isActor) {
      if (m.a === "stroke") {
        if (l.strokes.reduce((n, s) => n + s.length, 0) < 30000) l.strokes.push(m.s.slice(0, 600));
        return { changed: true };
      }
      if (m.a === "undo") {
        l.strokes.pop();
        return { changed: true };
      }
      if (m.a === "clear") {
        l.strokes = [];
        return { changed: true };
      }
      return {};
    }
    if (m.a === "guess" && player && !l.guessed.includes(who)) {
      const g = norm(String(m.v));
      if (!g) return {};
      const w = norm(l.word ?? "");
      const ok = g === w || (w.length > 3 && (g === w + "s" || w === g + "s"));
      if (ok) {
        const start = (l.deadline ?? ctx.now) - c.seconds * 1000;
        const speed = Math.max(0, Math.min(1, 1 - (ctx.now - start) / (c.seconds * 1000)));
        ctx.score(who, Math.round(100 + speed * 50));
        if (l.actor) ctx.score(l.actor, 50);
        l.guessed.push(who);
        l.guesses.push({ pid: who, text: "", ok: true });
        const others = l.pids.filter((p) => p !== l.actor && ctx.here(p));
        if (others.every((p) => l.guessed.includes(p))) finishEarly();
      } else {
        l.guesses.push({ pid: who, text: String(m.v).slice(0, 30), ok: false });
        if (l.guesses.length > 40) l.guesses.shift();
      }
      return { changed: true };
    }
    return {};
  }

  if (c.kind === "chain") {
    if (m.a !== "word" || !isActor) return {};
    const w = String(m.v).trim().toLowerCase();
    const last = l.chain[l.chain.length - 1];
    if (!/^[a-z]+$/.test(w)) return { error: "Letters only, please." };
    if (w.length < 5) return { error: "Words need at least 5 letters." };
    if (w[0] !== last[last.length - 1]) return { error: `It must start with ${last[last.length - 1].toUpperCase()}.` };
    if (l.chain.includes(w)) return { error: "That word has been used." };
    l.chain.push(w);
    ctx.score(who, 1);
    pickChainActor(l, ctx);
    return { changed: true };
  }

  if (c.kind === "memory") {
    if (m.a !== "flip" || !isActor || l.step !== "play") return {};
    const i = m.i;
    if (!Number.isInteger(i) || i < 0 || i >= l.cards.length || l.done.includes(i) || l.up.includes(i)) return {};
    l.up.push(i);
    if (l.up.length === 2) {
      const [a, b] = l.up;
      if (l.cards[a] === l.cards[b]) {
        l.done.push(a, b);
        l.pairs[who] = (l.pairs[who] ?? 0) + 1;
        ctx.score(who, 1);
        l.up = [];
        if (l.done.length >= l.cards.length) return { end: true, changed: true };
      } else {
        l.step = "hide";
        l.at = ctx.now + FLIP_BACK;
      }
    }
    return { changed: true };
  }

  if (c.kind === "knowme") {
    if (l.step === "secret" && isActor && m.a === "secret") {
      const v = String(Array.isArray(m.v) ? m.v[0] : m.v).trim().slice(0, 80);
      if (!v) return { error: "Type your answer first." };
      l.secret = v;
      l.at = ctx.now;
      return { changed: true };
    }
    if (l.step === "guess" && player && !isActor && m.a === "submit") {
      l.subs[who] = [String(Array.isArray(m.v) ? m.v[0] : m.v).slice(0, 80)];
      const others = l.pids.filter((p) => p !== l.actor && ctx.here(p));
      if (others.every((p) => l.subs[p])) finishEarly();
      return { changed: true };
    }
    if (l.step === "reveal" && isActor && m.a === "judge") {
      const r = l.results?.find((x) => x.pid === m.pid);
      if (!r) return {};
      r.ok = !r.ok;
      const d = r.ok ? 1 : -1;
      ctx.score(r.pid, 100 * d);
      ctx.score(who, 50 * d);
      r.total = r.ok ? 100 : 0;
      if (r.items[0]) r.items[0].p = r.total;
      return { changed: true };
    }
  }
  return {};
}

export function liveView(l: Live, viewer: string | undefined): LiveView {
  const c = l.cfg;
  const v: LiveView = {
    kind: c.kind,
    round: Math.max(0, l.round),
    rounds: l.rounds,
    step: l.step,
    deadline: l.deadline,
    actor: l.actor,
    submitted: c.kind === "words" ? l.locked : Object.keys(l.subs),
    buzz: c.kind === "perform" ? c.buzz : undefined,
    note: l.note,
    tally: l.tally,
  };
  const mine = viewer && viewer === l.actor;
  if (c.kind === "perform") {
    const it = c.items[l.wi % c.items.length];
    if (mine && l.step === "play") {
      v.secret = it.w;
      v.banned = it.ban;
    }
  } else if (c.kind === "shout") {
    v.prompt = l.prompt;
    v.wordLen = c.max;
  } else if (c.kind === "words") {
    const rd = c.rounds[Math.max(0, l.round)];
    v.prompt = rd.prompt;
    v.labels = rd.labels;
    v.letter = rd.letter;
    if (l.step === "reveal") v.results = l.results;
  } else if (c.kind === "draw") {
    v.strokes = l.strokes;
    v.guesses = l.guesses;
    v.wordLen = (l.word ?? "").length;
    if (mine || l.step === "reveal") v.secret = l.word;
    if (l.step === "reveal") v.word = l.word;
  } else if (c.kind === "chain") {
    v.chain = l.chain.slice(-10);
    v.out = l.out;
  } else if (c.kind === "memory") {
    const showing = new Set([...l.up, ...l.done]);
    v.board = { cards: l.cards.map((s, i) => (showing.has(i) ? s : null)), done: l.done };
    v.pairs = l.pairs;
  } else if (c.kind === "knowme") {
    v.prompt = l.prompt;
    v.guesses = undefined;
    if (l.step === "reveal") {
      v.results = l.results;
      v.word = l.secret;
    }
  }
  return v;
}
