// Live chat wire shapes (docs/API_CONTRACT.md §1.8). Ids and dates are
// strings because that is what JSON and Socket.IO deliver.
import type { ChatRoomType, UserRole } from "./domain";
import type { ApiResponse } from "./api";

export interface ChatRoomDTO {
  _id: string;
  slug: string;
  name: string;
  type: ChatRoomType;
  tournament: string | null;
  readOnly: boolean;
}

export interface ChatMessageDTO {
  _id: string;
  room: string;
  user: string;
  username: string;
  text: string;
  createdAt: string;
}

export interface PresenceUser {
  _id: string;
  username: string;
}

export interface PresencePayload {
  roomId: string;
  count: number;
  users: PresenceUser[];
}

/** Every client → server event answers through its ack with the REST envelope. */
export type ChatAck = (response: ApiResponse) => void;

// Payloads are `unknown` on purpose: they are validated with Zod in the
// handlers. The ack is optional at runtime (a client may omit it).
export interface ClientToServerEvents {
  "room:join": (payload: unknown, ack?: unknown) => void;
  "room:leave": (payload: unknown, ack?: unknown) => void;
  "message:send": (payload: unknown, ack?: unknown) => void;
  typing: (payload: unknown) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: ChatMessageDTO) => void;
  "message:deleted": (payload: { roomId: string; id: string }) => void;
  presence: (payload: PresencePayload) => void;
  typing: (payload: { roomId: string; userId: string; username: string }) => void;
}

export type InterServerEvents = Record<string, never>;

/** Set by the handshake middleware (realtime/auth.ts). */
export interface SocketData {
  user: { id: string; username: string; role: UserRole; tokenVersion: number };
}
