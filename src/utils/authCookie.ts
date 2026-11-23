// SEC-13: one definition of the auth cookie, used by login, register and logout.
import type { CookieOptions, Response } from "express";
import type { Types } from "mongoose";
import { signAuthToken, TOKEN_TTL_SECONDS } from "./authToken";

export const COOKIE_NAME = "token";

type SameSite = "lax" | "strict" | "none";
const SAME_SITE_VALUES: readonly string[] = ["lax", "strict", "none"] satisfies SameSite[];
const isSameSite = (value: string): value is SameSite => SAME_SITE_VALUES.includes(value);

/** The parts of a user the cookie needs. */
export interface CookieUser {
  _id: Types.ObjectId;
  tokenVersion?: number | null;
}

// SameSite:
//   production  → "none" (frontend on Vercel and API on Render are different
//                 sites today). Set COOKIE_SAMESITE=lax once the frontend
//                 reaches the API through the Vercel /api rewrite (DEP-04).
//   elsewhere   → "lax" (localhost:5173 → localhost:3005 is same-site).
// Secure: always in production, and whenever SameSite=None, because browsers
// reject SameSite=None cookies that are not Secure.
export const cookieOptions = (): CookieOptions & { sameSite: SameSite } => {
  const isProduction = process.env.NODE_ENV === "production";
  const requested = (process.env.COOKIE_SAMESITE || "").toLowerCase();
  const sameSite: SameSite = isSameSite(requested) ? requested : isProduction ? "none" : "lax";

  return {
    httpOnly: true,
    secure: isProduction || sameSite === "none",
    sameSite,
    path: "/",
  };
};

// The cookie lives exactly as long as the JWT inside it.
export const setAuthCookie = (res: Response, user: CookieUser): void => {
  res.cookie(COOKIE_NAME, signAuthToken(user._id, user.tokenVersion || 0), {
    ...cookieOptions(),
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
};

// Same attributes as when it was set, otherwise browsers keep the old cookie.
export const clearAuthCookie = (res: Response): void => {
  res.cookie(COOKIE_NAME, "", { ...cookieOptions(), expires: new Date(0) });
};
