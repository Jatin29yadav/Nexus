// Live chat over Socket.IO, attached to the same HTTP server as Express.
// Namespace /chat; the default namespace accepts no one.
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { allowedOrigins } from "../config/origins";
import { authenticate } from "./auth";
import { registerHandlers, clearPresenceTimers } from "./handlers";
import { setChatNamespace } from "./hub";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../types/chat";

export type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// Largest legitimate frame is a 500-character message plus a few ids.
export const MAX_FRAME_BYTES = 4 * 1024;

export function createRealtime(httpServer: HttpServer): ChatServer {
  const io: ChatServer = new Server(httpServer, {
    // Applies to the long-polling transport; the handshake middleware checks
    // Origin for WebSocket upgrades too. No cookies: auth is the ticket.
    cors: { origin: allowedOrigins, credentials: false },
    maxHttpBufferSize: MAX_FRAME_BYTES,
    serveClient: false,
  });

  io.of("/").use((socket, next) => next(new Error("Use the /chat namespace.")));

  const chat = io.of("/chat");
  chat.use((socket, next) => void authenticate(socket, next));
  chat.on("connection", (socket) => registerHandlers(chat, socket));
  setChatNamespace(chat);

  return io;
}

// Disconnects every socket, then closes the HTTP server too (io.close does both).
export function closeRealtime(io: ChatServer): Promise<void> {
  setChatNamespace(null);
  clearPresenceTimers();
  return new Promise((resolve, reject) => {
    void io.close((err) => (err ? reject(err) : resolve()));
  });
}
