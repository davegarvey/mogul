import type { Action, Command, GameRules, GameState } from "@mogul/engine";

export type { Action, Command, GameRules, GameState };

/** Seat kinds: how the seat plays. */
export type SeatKind = "human" | "bot" | "agent";

export interface SeatInfo {
  id: string;
  nickname: string;
  kind: SeatKind;
  /** True once a disconnected human has been handed to a bot for good. */
  botControlled: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomConfig {
  maxPlayers: number;
  graceSeconds: number;
  seed: number;
}

export interface RoomState {
  code: string;
  status: "lobby" | "playing" | "ended";
  config: RoomConfig;
  seats: SeatInfo[];
}

/** Client -> server messages. */
export type ClientMessage =
  | { type: "create-room"; config?: Partial<RoomConfig>; nickname?: string }
  | { type: "join-room"; code: string; nickname: string }
  | { type: "leave-room" }
  | { type: "add-bot" }
  | { type: "start-game" }
  | { type: "command"; command: Command }
  | { type: "chat"; text: string };

/** Server -> client messages. */
export type ServerMessage =
  | { type: "room-state"; room: RoomState }
  | { type: "snapshot"; snapshot: SnapshotEnvelope }
  | { type: "reject"; reason: string }
  | { type: "chat"; from: string; text: string }
  | { type: "game-ended"; winnerId: string; reason: string }
  | { type: "error"; reason: string };

/** The full open-information snapshot pushed to every seat after every change. */
export interface SnapshotEnvelope {
  version: number;
  round: number;
  phase: string;
  era: string;
  ended: boolean;
  winnerId: string | null;
  activeSeat: string | null;
  /** Full state — the game is open information by design. */
  state: GameState;
  /** Legal actions for the receiving seat (empty when it is not their turn). */
  actions: Action[];
}

/** Transport-agnostic frame wrapping: the same envelope works over WebSocket, HTTP, or in-process. */
export interface Frame<T> {
  seq: number;
  ts: number;
  payload: T;
}

export function frame<T>(payload: T, seq: number): Frame<T> {
  return { seq, ts: Date.now(), payload };
}

export function parseClientMessage(raw: string | ArrayBuffer): ClientMessage {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  const msg = JSON.parse(text) as ClientMessage;
  if (!msg || typeof msg.type !== "string") throw new Error("malformed message");
  return msg;
}

export function serializeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}
