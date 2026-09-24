import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { start } from "../src/index.js";
import type { ClientMessage, ServerMessage } from "@mogul/protocol";

let port: number;

beforeAll(async () => {
  port = await start(0);
});

afterAll(() => {
  // The server keeps running for the test process lifetime; no explicit close hook needed.
});

function connect(): { ws: WebSocket; messages: ServerMessage[]; send: (m: ClientMessage) => void; waitFor: (pred: (m: ServerMessage) => boolean) => Promise<ServerMessage> } {
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
  const waitFor = (pred: (m: ServerMessage) => boolean, timeoutMs = 5000): Promise<ServerMessage> =>
    new Promise((resolve, reject) => {
      const found = messages.find(pred);
      if (found) return resolve(found);
      const waiter = { pred, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const i = waiters.indexOf(waiter);
        if (i >= 0) waiters.splice(i, 1);
        reject(new Error("timed out waiting for message"));
      }, timeoutMs);
    });
  const send = (m: ClientMessage): void => ws.send(JSON.stringify(m));
  return { ws, messages, send, waitFor };
}

function open(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => ws.on("open", resolve));
}

describe("lobby", () => {
  it("creates a room, joins by code, and starts with bots", async () => {
    const host = connect();
    await open(host.ws);
    host.send({ type: "create-room", nickname: "Dave" });
    const roomState = await host.waitFor((m) => m.type === "room-state");
    expect(roomState.type).toBe("room-state");
    if (roomState.type !== "room-state") return;
    const code = roomState.room.code;
    expect(roomState.room.seats).toHaveLength(1);

    const guest = connect();
    await open(guest.ws);
    guest.send({ type: "join-room", code, nickname: "Sam" });
    await guest.waitFor((m) => m.type === "room-state" && m.room.seats.length === 2);

    // Host adds a bot, then starts.
    host.send({ type: "add-bot" });
    await host.waitFor((m) => m.type === "room-state" && m.room.seats.length === 3);
    host.send({ type: "start-game" });
    const snap = await host.waitFor((m) => m.type === "snapshot");
    if (snap.type !== "snapshot") return;
    expect(snap.snapshot.state.players).toHaveLength(3);
    expect(snap.snapshot.actions.length).toBeGreaterThan(0);

    host.ws.close();
    guest.ws.close();
  });

  it("a full game completes with a bot filling in after a disconnect", async () => {
    const host = connect();
    await open(host.ws);
    host.send({ type: "create-room", nickname: "Dave", config: { graceSeconds: 1, maxPlayers: 4 } });
    const rs = await host.waitFor((m) => m.type === "room-state");
    if (rs.type !== "room-state") return;
    const code = rs.room.code;

    const guest = connect();
    await open(guest.ws);
    guest.send({ type: "join-room", code, nickname: "Sam" });
    host.send({ type: "add-bot" });
    host.send({ type: "add-bot" });
    await host.waitFor((m) => m.type === "room-state" && m.room.seats.length === 4);

    // The host plays its own seat: pass or end the turn where legal, otherwise take the first legal action.
    const hostId = rs.room.seats[0].id;
    host.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      if (msg.type !== "snapshot" || msg.snapshot.activeSeat !== hostId || msg.snapshot.actions.length === 0) return;
      const actions = msg.snapshot.actions;
      const pick = actions.find((a) => a.command.type === "pass-auction" || a.command.type === "end-turn") ?? actions[0];
      host.send({ type: "command", command: pick.command });
    });

    // Guest disconnects before start; grace period elapses -> bot handoff.
    guest.ws.close();
    host.send({ type: "start-game" });
    await host.waitFor((m) => m.type === "room-state" && m.room.seats.every((s) => s.botControlled || s.connected));

    // Game should eventually end (bots plus the host's own moves keep it going).
    const end = await host.waitFor((m) => m.type === "game-ended", 60000);
    expect(end.type).toBe("game-ended");
    host.ws.close();
  });

  it("reconnect reattaches the seat and re-sends the full snapshot", async () => {
    const host = connect();
    await open(host.ws);
    host.send({ type: "create-room", nickname: "Dave", config: { maxPlayers: 2 } });
    const rs = await host.waitFor((m) => m.type === "room-state");
    if (rs.type !== "room-state") return;
    const code = rs.room.code;

    const guest = connect();
    await open(guest.ws);
    guest.send({ type: "join-room", code, nickname: "Sam" });
    await guest.waitFor((m) => m.type === "room-state" && m.room.seats.length === 2);

    host.send({ type: "start-game" });
    await host.waitFor((m) => m.type === "snapshot");

    // Disconnect the host mid-game, then reconnect with the same nickname.
    const hostId = rs.room.seats[0].id;
    const before = host.messages.filter((m): m is Extract<ServerMessage, { type: "snapshot" }> => m.type === "snapshot");
    host.ws.close();

    const re = connect();
    await open(re.ws);
    re.send({ type: "join-room", code, nickname: "Dave" });
    const reSnap = await re.waitFor((m) => m.type === "snapshot");
    if (reSnap.type !== "snapshot") return;
    // Full state re-sent, no event replay needed: same players and a state object.
    expect(reSnap.snapshot.state.players).toHaveLength(2);
    expect(reSnap.snapshot.state.players[0].id).toBe(hostId);
    void before;
    re.ws.close();
  });
});
