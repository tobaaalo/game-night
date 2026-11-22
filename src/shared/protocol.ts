// Messages shared by the room server (Cloudflare Durable Object) and the app.
import type { TeamMsg, TeamState } from "./team";
import type { LiveMsg, LiveView } from "./live";

export type Media =
  | { type: "image"; src: string; alt: string }
  | { type: "pair"; a: { src?: string; text?: string }; b: { src?: string; text?: string } }
  | { type: "flag"; code: string }
  | { type: "shape"; d: string }
  | { type: "big"; text: string; sub?: string };

/** A question as the host sends it. `correct` never leaves the server before the reveal. */
export interface HostQuestion {
  prompt: string;
  media?: Media;
  options: string[];
  correct: number;
  seconds: number;
  points: number;
  label?: string;
  explain?: string;
  /** Labels shown under each picture after the reveal, e.g. ["AI", "Real"]. Host-only until reveal. */
  captions?: string[];
  /** Clue games: the clues, shown one at a time. Guess on the first for the most points. */
  clues?: string[];
}

/** The same question as players see it. */
export type PublicQuestion = Omit<HostQuestion, "correct" | "explain" | "captions" | "clues"> & {
  n: number;
  deadline: number;
  /** Clue games: the clues shown so far. */
  shown?: string[];
  clueCount?: number;
};

export interface PublicPlayer {
  pid: string;
  name: string;
  score: number;
  connected: boolean;
  answered: boolean;
}

export interface RevealResult {
  correct: number;
  explain?: string;
  captions?: string[];
  picks: Record<string, { idx: number; gained: number }>;
}

export type Phase = "lobby" | "question" | "reveal" | "ended" | "team" | "live";

export interface RoomState {
  code: string;
  game: string;
  phase: Phase;
  hostConnected: boolean;
  players: PublicPlayer[];
  question?: PublicQuestion;
  reveal?: RevealResult;
  total?: number;
  /** Server time when this was sent, so a phone with a wrong clock still counts down correctly. */
  now?: number;
  /** When the next question starts by itself. */
  nextAt?: number;
  /** Team Word Ladder: the shared board, and who is on the team (the host first). */
  team?: TeamState & { members: { id: string; name: string; here: boolean }[] };
  /** Live games: the shared state of the round in play. */
  live?: LiveView;
  /** Players who asked to leave and are waiting for the host to say yes. */
  leaveReq?: { pid: string; name: string }[];
  /** A host handover waiting for this player to accept. */
  offer?: { pid: string; name: string; leaving: boolean };
}

export type ClientMsg =
  | { t: "setup"; game: string; total: number; queue?: HostQuestion[] }
  | { t: "next" }
  | { t: "question"; q: HostQuestion }
  | { t: "reveal" }
  | { t: "end" }
  | { t: "lobby" }
  | { t: "kick"; pid: string }
  | { t: "leave"; force?: boolean }
  | { t: "leave-ok"; pid: string }
  | { t: "leave-no"; pid: string }
  | { t: "host-offer"; pid: string; self?: string; name: string }
  | { t: "host-leave"; self?: string; name: string }
  | { t: "host-cancel" }
  | { t: "host-answer"; accept: boolean }
  | { t: "answer"; idx: number }
  | { t: "ping" }
  | TeamMsg
  | LiveMsg;

export type ServerMsg =
  | { t: "state"; state: RoomState; you?: string }
  | { t: "error"; message: string }
  | { t: "pong" }
  /** You are the host now. Keep this key. */
  | { t: "host"; key: string }
  /** You were the host; you are a player now. */
  | { t: "demote"; code: string; pid: string; name: string }
  /** The host said yes: you have left the room. */
  | { t: "left" }
  /** The host asked you to stay. */
  | { t: "denied" };

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const normaliseCode = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);

/* ---------- Shared custom games ---------- */
export type SharedType = "cards" | "quiz" | "reveal" | "timed";
export type ShareScope = "link" | "public";
export type ShareStatus = "link" | "pending" | "approved" | "rejected";
export interface SharedGame {
  id: string;
  name: string;
  type: SharedType;
  lines: string;
  scope: ShareScope;
  status: ShareStatus;
  author: string;
  created: number;
}
