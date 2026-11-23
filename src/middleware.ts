import type { Request, RequestHandler } from "express";
import { verifyAuthToken, verifyChatTicket, type AuthTokenClaims } from "./utils/authToken";
import { messageOf } from "./utils/narrow";
import { User, type UserDocument } from "./models/User";

// Resolves a token to its user, or null when the user no longer exists.
// Throws when the token is invalid, expired, or revoked: a token is only good
// while its `tv` equals the user's current tokenVersion (SEC-09). Tokens
// issued before tokenVersion existed carry no `tv` and count as version 0.
const userForClaims = async (decoded: AuthTokenClaims): Promise<UserDocument | null> => {
  const user = await User.findById(decoded.userId).select("-password +tokenVersion");
  if (user && (decoded.tv || 0) !== (user.tokenVersion || 0)) {
    throw new Error("token revoked");
  }
  return user;
};

export const userForToken = (token: unknown): Promise<UserDocument | null> =>
  userForClaims(verifyAuthToken(token));

// Same revocation rule for a live chat ticket (utils/authToken.ts).
export const userForChatTicket = (ticket: unknown): Promise<UserDocument | null> =>
  userForClaims(verifyChatTicket(ticket));

// The auth cookie as cookie-parser left it: usually a string, but a "j:"
// cookie is parsed into an object. Anything that is not a string is refused
// by verifyAuthToken, exactly as jsonwebtoken refused it before.
export const tokenCookie = (req: Request): unknown => {
  const cookies: Record<string, unknown> = req.cookies ?? {};
  return cookies.token;
};

/**
 * The signed-in user on a route behind isLoggedIn. Throws if there is none,
 * which only a routing mistake can cause; controllers call it inside their
 * try block, so that surfaces as their usual 500, as `req.user._id` did.
 */
export const currentUser = (req: Request): UserDocument => {
  if (!req.user) throw new Error("currentUser: route is not behind isLoggedIn");
  return req.user;
};

export const isLoggedIn: RequestHandler = async (req, res, next) => {
  try {
    const token = tokenCookie(req);

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided." });
    }

    req.user = await userForToken(token);

    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found in database." });
    }

    next();
  } catch (error) {
    console.error("Auth Error:", messageOf(error));
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token." });
  }
};

// For public routes whose response depends on who is asking. Never rejects:
// a missing, invalid or expired cookie simply means "anonymous".
export const optionalAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = tokenCookie(req);
    if (token) {
      req.user = await userForToken(token);
    }
  } catch {
    req.user = null;
  }
  next();
};

export const isAdmin: RequestHandler = (req, res, next) => {
  if (req.user && req.user.role === "Admin") {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: "Unauthorized. Admin Access Required.",
    });
  }
};
