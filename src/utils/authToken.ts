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
// no claims.
export const verifyAuthToken = (token: string): AuthTokenClaims => {
  const decoded = jwt.verify(token, secret(), { algorithms: [ALGORITHM] });
  if (typeof decoded === "string") return {};
  const claims: Record<string, unknown> = decoded;
  return { userId: claims.userId, tv: claims.tv };
};
