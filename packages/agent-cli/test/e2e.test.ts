import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { start } from "@mogul/server";
import { AgentCli } from "../src/agent.js";
import type { LlmReply } from "../src/llm.js";
import type { ClientMessage, ServerMessage } from "@mogul/protocol";

let port: number;

beforeAll(async () => {
  port = await start(0);
});

function connect() {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const messages: ServerMessage[] = [];
  const waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString()) as ServerMessage;
    messages.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(msg)) {
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });
  const waitFor = (pred: (m: ServerMessage) => boolean, timeoutMs = 60000) =>
    new Promise<ServerMessage>((resolve, reject) => {
      const found = messages.find(pred);
      if (found) return resolve(found);
      const waiter = { pred, resolve };
      waiters.push(waiter);
      setTimeout(() => reject(new Error("timeout")), timeoutMs);
    });
  const send = (m: ClientMessage): void => ws.send(JSON.stringify(m));
  return { ws, messages, send, waitFor };
}

function open(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => ws.on("open", resolve));
}

/** Deterministic stub LLM: always picks a legal action; can be primed to emit garbage. */
function stubLlm(behavior: "good" | "garbage-first" | "out-of-range") {
  return async (): Promise<LlmReply> => {
    if (behavior === "garbage-first") {
      behavior = "good";
      return { ok: false, reason: "no {\"action\": N} object in reply", raw: "sure, I'll bid on that one" };
    }
    if (behavior === "out-of-range") {
      behavior = "good";
      return { ok: false, reason: "action 99 out of range", raw: '{"action": 99}' };
    }
    return { ok: true, actionIndex: 0, raw: '{"action": 1}' };
  };
}

describe("agent CLI end-to-end", () => {
  it("plays a full game through the action-menu turn loop against scripted bots", async () => {
    // Host room with three bots and one agent seat.
    const host = connect();
    await open(host.ws);
    host.send({ type: "create-room", nickname: "Host", config: { maxPlayers: 4, graceSeconds: 1 } });
    const rs = await host.waitFor((m) => m.type === "room-state");
    if (rs.type !== "room-state") throw new Error("no room");
    const code = rs.room.code;
    // Two bots + host + agent = 4 seats (maxPlayers 4).
    host.send({ type: "add-bot" });
    host.send({ type: "add-bot" });

    const agent = new AgentCli({
      url: `ws://localhost:${port}`,
      nickname: "AgentX",
      llm: { baseUrl: "", model: "stub", apiKey: "stub" },
      maxRetries: 3,
      llmFn: stubLlm("garbage-first"),
    });
    await agent.join(code);
    host.send({ type: "start-game" });
    await host.waitFor((m) => m.type === "snapshot");
    // The host only observes: disconnect it so the grace-period handoff gives its seat to a bot.
    host.ws.close();

    let guard = 0;
    while (!agent.result.finished && guard++ < 60) {
      await agent.playTurn();
    }
    expect(agent.result.finished).toBe(true);
    expect(agent.result.commands).toBeGreaterThan(5);
    expect(agent.result.malformed).toBeGreaterThan(0); // the garbage-first stub exercised repair
    expect(agent.result.rejections).toBe(0);

    agent.close();
    host.ws.close();
  });

  it("falls back to pass/end-turn when the LLM keeps producing bad replies", async () => {
    const host = connect();
    await open(host.ws);
    host.send({ type: "create-room", nickname: "Host", config: { maxPlayers: 2, graceSeconds: 1 } });
    const rs = await host.waitFor((m) => m.type === "room-state");
    if (rs.type !== "room-state") throw new Error("no room");
    const code = rs.room.code;

    const agent = new AgentCli({
      url: `ws://localhost:${port}`,
      nickname: "Dumb",
      llm: { baseUrl: "", model: "stub", apiKey: "stub" },
      maxRetries: 1,
      llmFn: stubLlm("out-of-range"),
    });
    await agent.join(code);
    host.send({ type: "start-game" });
    await host.waitFor((m) => m.type === "snapshot");
    // The host only observes: disconnect it so the grace-period handoff gives its seat to a bot.
    host.ws.close();

    await agent.playTurn();
    expect(agent.result.fallbacks).toBeGreaterThanOrEqual(1);
    agent.close();
    host.ws.close();
  });
});
