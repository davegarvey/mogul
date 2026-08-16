import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { parseClientMessage, serializeServerMessage } from "@mogul/protocol";
import type { ClientMessage, ServerMessage } from "@mogul/protocol";
import { createRoom, Room } from "./room.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const PORT = Number(process.env.PORT ?? 8137);

const rooms = new Map<string, Room>();
const sockets = new Map<WebSocket, { room: Room | null; seatId: string | null }>();

const httpServer = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = join(PUBLIC_DIR, path);
    if (!file.startsWith(PUBLIC_DIR)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    const ext = path.split(".").pop() ?? "";
    const types: Record<string, string> = {
      html: "text/html; charset=utf-8",
      js: "application/javascript",
      css: "text/css",
      json: "application/json",
    };
    res.writeHead(200, { "content-type": types[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const info = { room: null as Room | null, seatId: null as string | null };
  sockets.set(ws, info);

  const send = (msg: ServerMessage): void => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serializeServerMessage(msg));
    }
  };

  ws.on("message", (data) => {
    let msg: ClientMessage;
    try {
      msg = parseClientMessage((data as Buffer).toString());
    } catch {
      send({ type: "error", reason: "malformed message" });
      return;
    }

    switch (msg.type) {
      case "create-room": {
        if (info.room) return;
        const room = createRoom(msg.config ?? {}, Math.random);
        rooms.set(room.code, room);
        info.room = room;
        info.seatId = room.addSeat(msg.nickname ?? "Host", "human", send, true).id;
        return;
      }
      case "join-room": {
        if (info.room) return;
        const room = rooms.get(msg.code.trim().toUpperCase());
        if (!room) {
          send({ type: "error", reason: "no such room" });
          return;
        }
        if (room.status !== "lobby" && !room.seats.some((s) => s.nickname === msg.nickname)) {
          send({ type: "error", reason: "that game has already started" });
          return;
        }
        if (room.status === "lobby" && room.seats.length >= room.config.maxPlayers) {
          send({ type: "error", reason: "room is full" });
          return;
        }
        // Reconnect: a returning human reattaches their existing seat.
        const existing = room.seats.find(
          (s) => s.nickname === msg.nickname && s.kind === "human" && !s.connected,
        );
        info.room = room;
        if (existing) {
          info.seatId = room.rejoin(msg.nickname, send)?.id ?? null;
        } else {
          info.seatId = room.addSeat(msg.nickname, "human", send, room.seats.length === 0).id;
        }
        return;
      }
      default: {
        if (!info.room) {
          send({ type: "error", reason: "join or create a room first" });
          return;
        }
        info.room.handle(info.seatId!, msg);
      }
    }
  });

  ws.on("close", () => {
    if (info.room && info.seatId) {
      info.room.onDisconnect(info.seatId);
    }
    sockets.delete(ws);
  });
});

export function start(port = PORT): Promise<number> {
  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      const addr = httpServer.address();
      const actual = typeof addr === "object" && addr ? addr.port : port;
      console.log(`Mogul server listening on http://localhost:${actual}`);
      resolve(actual);
    });
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  void start();
}

export { rooms, Room };
