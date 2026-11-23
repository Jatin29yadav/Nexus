// Handshake check for the /chat namespace.
// 1. Origin: WebSocket upgrades are not subject to CORS, so a page on any
//    site could open one. A browser always sends Origin; when present it must
//    be on the same allow-list as REST (cross-site WebSocket hijacking).
// 2. Ticket: a 60 s JWT from POST /api/chat/ticket (utils/authToken.ts), with
//    the same tokenVersion revocation rule as the session cookie (SEC-09).
import type { ExtendedError, Socket } from "socket.io";
import { allowedOrigins } from "../config/origins";
import { userForChatTicket } from "../middleware";
import { isRecord } from "../utils/narrow";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "../types/chat";

export type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export const ORIGIN_REJECTED = "Origin not allowed.";
export const TICKET_REJECTED = "Invalid or expired ticket.";

export async function authenticate(
  socket: ChatSocket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  const origin = socket.handshake.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) return next(new Error(ORIGIN_REJECTED));

  const auth: unknown = socket.handshake.auth;
  const ticket = isRecord(auth) ? auth.ticket : undefined;
  try {
    const user = await userForChatTicket(ticket);
    if (!user) return next(new Error(TICKET_REJECTED));
    socket.data.user = {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    };
    next();
  } catch {
    next(new Error(TICKET_REJECTED));
  }
}
