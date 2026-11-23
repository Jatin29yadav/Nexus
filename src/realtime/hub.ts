// The one handle REST code uses to reach live sockets. Before createRealtime()
// runs (tests of the plain app, seed scripts) every call is a no-op.
import type { Namespace } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../types/chat";

export type ChatNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let chat: ChatNamespace | null = null;

export const setChatNamespace = (namespace: ChatNamespace | null): void => {
  chat = namespace;
};

/** Every socket of one user also sits in this Socket.IO room. */
export const userRoom = (userId: string): string => `user:${userId}`;

export function broadcastDeleted(roomId: string, id: string): void {
  chat?.to(roomId).emit("message:deleted", { roomId, id });
}

// Logout revokes every token of the user (SEC-09); live sockets go with them.
export function disconnectUser(userId: string): void {
  chat?.in(userRoom(userId)).disconnectSockets(true);
}
