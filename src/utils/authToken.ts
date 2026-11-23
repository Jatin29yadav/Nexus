// The one place that signs and verifies the auth JWT.
import jwt from "jsonwebtoken";
import type { Types } from "mongoose";
import { ExpressError } from "./expressError";

export const ALGORITHM = "HS256";
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * What a verified token carries. Both claims are `unknown`: a token signed
 * with our secret may still predate a claim (no `tv` before SEC-09).
 */
export interface AuthTokenClaims {
  userId?: unknown;
  tv?: unknown;
}

// server.ts refuses to boot without JWT_SECRET (config/env.ts). Should it go
// missing anyway, fail with a fixed message instead of library internals.
const secret = (): string => {
  if (!process.env.JWT_SECRET) {
    throw new ExpressError(500, "Server configuration error.");
  }
  return process.env.JWT_SECRET;
};

// `tv` is the user's tokenVersion at issue time (SEC-09 revocation).
export const signAuthToken = (userId: Types.ObjectId | string, tokenVersion = 0): string =>
  jwt.sign({ userId, tv: tokenVersion }, secret(), {
    algorithm: ALGORITHM,
    expiresIn: TOKEN_TTL_SECONDS,
  });

// Throws on a bad signature, an expired token, or any algorithm other than
// the one we sign with (SEC-09). A token whose payload is a plain string has
// no claims. A token that is not a string fails the way jsonwebtoken fails it.
// A token with a `purpose` claim (a chat ticket) is never a session token.
export const verifyAuthToken = (token: unknown): AuthTokenClaims => {
  if (typeof token !== "string") throw new jwt.JsonWebTokenError("jwt must be a string");
  const decoded = jwt.verify(token, secret(), { algorithms: [ALGORITHM] });
  if (typeof decoded === "string") return {};
  const claims: Record<string, unknown> = decoded;
  if (claims.purpose !== undefined) throw new jwt.JsonWebTokenError("not a session token");
  return { userId: claims.userId, tv: claims.tv };
};

// ── Live chat tickets ───────────────────────────────────────────────────
// The browser cannot rely on the auth cookie reaching a WebSocket handshake
// (cross-site today; the Vercel /api rewrite does not proxy upgrades), so a
// signed-in user trades the cookie for a short-lived ticket over REST and
// hands it to Socket.IO in `auth`. Same secret, different `purpose`, so a
// ticket is useless as a session cookie and a session token is useless here.
export const CHAT_TICKET_PURPOSE = "chat";
export const CHAT_TICKET_TTL_SECONDS = 60;

export const signChatTicket = (userId: Types.ObjectId | string, tokenVersion = 0): string =>
  jwt.sign({ userId, tv: tokenVersion, purpose: CHAT_TICKET_PURPOSE }, secret(), {
    algorithm: ALGORITHM,
    expiresIn: CHAT_TICKET_TTL_SECONDS,
  });

export const verifyChatTicket = (ticket: unknown): AuthTokenClaims => {
  if (typeof ticket !== "string") throw new jwt.JsonWebTokenError("ticket must be a string");
  const decoded = jwt.verify(ticket, secret(), { algorithms: [ALGORITHM] });
  if (typeof decoded === "string") throw new jwt.JsonWebTokenError("ticket has no claims");
  const claims: Record<string, unknown> = decoded;
  if (claims.purpose !== CHAT_TICKET_PURPOSE) throw new jwt.JsonWebTokenError("not a chat ticket");
  return { userId: claims.userId, tv: claims.tv };
};
