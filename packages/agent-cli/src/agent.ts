import { DEFAULT_RULES, getLegalActions } from "@mogul/engine";
import type { GameState } from "@mogul/engine";
import type { ClientMessage, ServerMessage, SnapshotEnvelope } from "@mogul/protocol";
import { buildPrompt, loadLlmConfig, requestAction } from "./llm.js";
import type { LlmConfig } from "./llm.js";

export interface AgentCliOptions {
  url: string;
  nickname: string;
  llm: LlmConfig;
  maxRetries: number;
  /** Injectable LLM call (used by tests; defaults to the HTTP client). */
  llmFn?: typeof requestAction;
}

export interface AgentCliResult {
  /** True when the game reached its end. */
  finished: boolean;
  commands: number;
  rejections: number;
  malformed: number;
  fallbacks: number;
}

/**
 * The agent turn loop:
 * - block while it is not the seat's turn
 * - on its turn, render the snapshot + legal action menu, ask the LLM for one action
 * - validate shape, submit the typed command with the snapshot state version
 * - re-render after every ack; on server rejection, feed the reason back for repair
 * - bounded retries; fallback to a clock-safe legal move on exhaustion
 */
export class AgentCli {
  private ws: WebSocket;
  private seatId: string | null = null;
  private pending: ((msg: ServerMessage) => void) | null = null;
  private queue: ServerMessage[] = [];
  result: AgentCliResult = { finished: false, commands: 0, rejections: 0, malformed: 0, fallbacks: 0 };

  constructor(private opts: AgentCliOptions) {
    this.ws = new WebSocket(opts.url);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      this.queue.push(msg);
      if (this.pending) this.pump();
    };
  }

  private pump(): void {
    while (this.queue.length > 0 && this.pending) {
      const msg = this.queue.shift()!;
      this.pending(msg);
    }
  }

  private waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 60000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout waiting for server message")), timeoutMs);
      this.pending = (msg) => {
        if (pred(msg)) {
          clearTimeout(timer);
          this.pending = null;
          resolve(msg);
        }
      };
      this.pump();
    });
  }

  private send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** Join the room as a seat. The game may already be running or still in the lobby. */
  async join(code: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("connection failed"));
    });
    this.send({ type: "join-room", code, nickname: this.opts.nickname });
    const rs = await this.waitFor((m) => m.type === "room-state" || m.type === "error");
    if (rs.type !== "room-state") throw new Error((rs as { reason: string }).reason ?? "join failed");
    const seat = rs.room.seats.find((s) => s.nickname === this.opts.nickname);
    if (!seat) throw new Error("no seat for this agent");
    this.seatId = seat.id;
  }

  /** Block until it is our turn, then play it. */
  async playTurn(): Promise<void> {
    const snapMsg = await this.waitFor((m) => m.type === "snapshot");
    const snap = (snapMsg as { snapshot: SnapshotEnvelope }).snapshot;
    if (snap.ended) {
      this.result.finished = true;
      return;
    }
    if (snap.activeSeat !== this.seatId) {
      await this.playTurn();
      return;
    }
    await this.act(snap);
  }

  private async act(snap: SnapshotEnvelope): Promise<void> {
    const actions = snap.actions;
    if (actions.length === 0) {
      // Nothing legal: fall back to pass/end-turn via the server clock rules.
      this.result.fallbacks++;
      return;
    }
    const prompt = buildPrompt(snap, DEFAULT_RULES, this.seatId!);
    for (let attempt = 0; attempt < this.opts.maxRetries; attempt++) {
      const reply = await (this.opts.llmFn ?? requestAction)(this.opts.llm, prompt, actions.length);
      if (!reply.ok) {
        this.result.malformed++;
        continue; // re-prompt with the same menu (shape failure, nothing sent)
      }
      const action = actions[reply.actionIndex];
      // Submit with the snapshot's state version; a stale command is rejected by the server.
      this.send({ type: "command", command: action.command });
      const outcome = await this.waitFor((m) => m.type === "snapshot" || m.type === "reject");
      if (outcome.type === "snapshot") {
        this.result.commands++;
        if (outcome.snapshot.ended) {
          this.result.finished = true;
          return;
        }
        // Re-render from the fresh snapshot: same turn, more actions available.
        if (outcome.snapshot.activeSeat === this.seatId && outcome.snapshot.actions.length > 0) {
          await this.act(outcome.snapshot);
        }
        return;
      }
      this.result.rejections++;
      // Repair loop: present the reason back and try again.
      const retryPrompt = `${prompt}\n\nYour previous action was rejected by the server: ${(outcome as { reason: string }).reason}\nPick a different action.`;
      const retry = await (this.opts.llmFn ?? requestAction)(this.opts.llm, retryPrompt, actions.length);
      if (retry.ok) {
        this.send({ type: "command", command: actions[retry.actionIndex].command });
        const outcome2 = await this.waitFor((m) => m.type === "snapshot" || m.type === "reject");
        if (outcome2.type === "snapshot") {
          this.result.commands++;
          if (outcome2.snapshot.ended) {
            this.result.finished = true;
            return;
          }
          if (outcome2.snapshot.activeSeat === this.seatId && outcome2.snapshot.actions.length > 0) {
            await this.act(outcome2.snapshot);
          }
          return;
        }
      }
    }
    // Retries exhausted: pick the clock-safe fallback (pass/end-turn) if legal, else do nothing.
    const fallback = getLegalActions(snap.state, DEFAULT_RULES, this.seatId!).find(
      (a) => a.command.type === "pass-auction" || a.command.type === "end-turn",
    );
    if (fallback) {
      this.result.fallbacks++;
      this.send({ type: "command", command: fallback.command });
      const done = await this.waitFor((m) => m.type === "snapshot" || m.type === "reject");
      if (done.type === "snapshot" && done.snapshot.ended) this.result.finished = true;
    }
  }

  close(): void {
    this.ws.close();
  }
}

export { buildPrompt, loadLlmConfig };
export type { GameState };
