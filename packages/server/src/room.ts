import {
  DEFAULT_RULES,
  activePlayerId,
  applyCommand,
  buildSnapshot,
  createGame,
  playerById,
} from "@mogul/engine";
import type { GameRules, GameState } from "@mogul/engine";
import { scriptedBot } from "@mogul/bot";
import type { Bot } from "@mogul/bot";
import type { ClientMessage, RoomConfig, RoomState, SeatInfo, ServerMessage, SnapshotEnvelope } from "@mogul/protocol";

export type SendFn = (msg: ServerMessage) => void;

export interface Seat extends SeatInfo {
  send: SendFn | null;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(rng: () => number): string {
  let code = "";
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

export class Room {
  readonly code: string;
  config: RoomConfig;
  seats: Seat[] = [];
  status: "lobby" | "playing" | "ended" = "lobby";
  state: GameState | null = null;
  rules: GameRules = DEFAULT_RULES;
  winnerId: string | null = null;

  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private bot: Bot = scriptedBot(1);

  constructor(code: string, config: RoomConfig) {
    this.code = code;
    this.config = config;
  }

  private push(msg: ServerMessage, to?: Seat): void {
    if (to) {
      to.send?.(msg);
      return;
    }
    for (const s of this.seats) s.send?.(msg);
  }

  private pushRoomState(): void {
    const room: RoomState = {
      code: this.code,
      status: this.status,
      config: this.config,
      seats: this.seats.map(({ id, nickname, kind, botControlled, connected, isHost }) => ({
        id,
        nickname,
        kind,
        botControlled,
        connected,
        isHost,
      })),
    };
    this.push({ type: "room-state", room });
  }

  private snapshotFor(seat: Seat): SnapshotEnvelope {
    return buildSnapshot(this.state!, this.rules, seat.id);
  }

  private pushSnapshot(): void {
    if (!this.state) return;
    for (const seat of this.seats) {
      this.push({ type: "snapshot", snapshot: this.snapshotFor(seat) }, seat);
    }
  }

  addSeat(nickname: string, kind: Seat["kind"], send: SendFn | null, isHost: boolean): Seat {
    const seat: Seat = {
      id: `s${this.seats.length + 1}`,
      nickname,
      kind,
      botControlled: false,
      connected: send !== null,
      isHost,
      send,
    };
    this.seats.push(seat);
    this.pushRoomState();
    return seat;
  }

  /** Reattach a returning connection to an existing disconnected seat. Returns the seat or null. */
  rejoin(nickname: string, send: SendFn): Seat | null {
    const seat = this.seats.find((s) => s.nickname === nickname);
    if (!seat) return null;
    const grace = this.graceTimers.get(seat.id);
    if (grace) {
      clearTimeout(grace);
      this.graceTimers.delete(seat.id);
    }
    // A returning player always reclaims their seat, even after a bot has taken over.
    seat.botControlled = false;
    seat.connected = true;
    seat.send = send;
    this.pushRoomState();
    // Reconnect: re-send the full current snapshot, no event replay.
    if (this.state) {
      this.push({ type: "snapshot", snapshot: this.snapshotFor(seat) }, seat);
    }
    this.maybeTickBot();
    return seat;
  }

  onDisconnect(seatId: string): void {
    const seat = this.seats.find((s) => s.id === seatId);
    if (!seat) return;
    seat.connected = false;
    seat.send = null;
    this.pushRoomState();
    if (this.state && this.status === "playing") {
      const grace = setTimeout(() => this.handOff(seatId), this.config.graceSeconds * 1000);
      this.graceTimers.set(seatId, grace);
    }
  }

  private handOff(seatId: string): void {
    const seat = this.seats.find((s) => s.id === seatId);
    if (!seat || seat.botControlled || seat.connected) return;
    seat.botControlled = true;
    this.graceTimers.delete(seatId);
    this.pushRoomState();
    this.maybeTickBot();
  }

  startGame(): string | null {
    const humans = this.seats.filter((s) => s.kind === "human");
    if (this.seats.length < 2) return "need at least two seats to start";
    if (this.seats.length > this.config.maxPlayers) return "room is over capacity";
    if (!humans.some((s) => s.isHost)) return "only the host can start the game";
    this.status = "playing";
    this.state = createGame(
      this.seats.map((s) => ({ id: s.id, name: s.nickname })),
      this.rules,
      this.config.seed,
    );
    this.pushRoomState();
    this.maybeTickBot();
    this.pushSnapshot();
    return null;
  }

  /** A human sends a typed command for their seat. */
  submitCommand(seatId: string, command: { type: string; [k: string]: unknown }): void {
    const seat = this.seats.find((s) => s.id === seatId);
    if (!this.state || !seat) return;
    const res = applyCommand(this.state, this.rules, seatId, command as never);
    if (res.ok) {
      this.checkEnded();
      this.maybeTickBot();
      this.pushSnapshot();
    } else {
      this.push({ type: "reject", reason: res.reason }, seat);
    }
  }

  private checkEnded(): void {
    if (this.state?.ended && this.status === "playing") {
      this.status = "ended";
      this.winnerId = this.state.winnerId;
      this.push({ type: "game-ended", winnerId: this.state.winnerId!, reason: this.state.events.at(-1)?.type ?? "ended" });
    }
  }

  /** Drive bot seats: if the active seat is bot-controlled, act immediately. */
  maybeTickBot(): void {
    if (!this.state || this.state.ended) return;
    const pid = activePlayerId(this.state, this.rules);
    if (pid === null) return;
    const seat = this.seats.find((s) => s.id === pid);
    if (!seat || (seat.kind !== "bot" && !seat.botControlled)) return;
    setImmediate(() => {
      if (!this.state || this.state.ended) return;
      if (activePlayerId(this.state, this.rules) !== pid) return;
      const cmd = this.bot.chooseAction(this.state!, this.rules, pid);
      if (cmd) {
        const res = applyCommand(this.state!, this.rules, pid, cmd);
        if (res.ok) {
          this.checkEnded();
          this.maybeTickBot();
          this.pushSnapshot();
        }
      }
    });
  }

  handle(seatId: string, msg: ClientMessage): void {
    const seat = this.seats.find((s) => s.id === seatId);
    if (!seat) return;
    switch (msg.type) {
      case "add-bot":
        if (this.status !== "lobby") break;
        if (this.seats.length >= this.config.maxPlayers) {
          this.push({ type: "error", reason: "room is full" }, seat);
          break;
        }
        this.addSeat(`Bot ${this.seats.length + 1}`, "bot", null, false);
        break;
      case "start-game": {
        const err = this.startGame();
        if (err) this.push({ type: "error", reason: err }, seat);
        break;
      }
      case "command":
        this.submitCommand(seatId, msg.command as never);
        break;
      case "leave-room":
        this.onDisconnect(seatId);
        break;
      default:
        break;
    }
  }

  cleanup(): void {
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
  }
}

export function createRoom(config: Partial<RoomConfig>, rand: () => number): Room {
  const full: RoomConfig = {
    maxPlayers: 4,
    graceSeconds: 30,
    seed: Math.floor(rand() * 1_000_000),
    ...config,
  };
  return new Room(randomCode(rand), full);
}

export { playerById };
