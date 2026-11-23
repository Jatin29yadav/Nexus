// req.user is set by isLoggedIn (always a user) and optionalAuth (a user,
// null, or left unset) in src/middleware.ts.
import type { UserDocument } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      user?: UserDocument | null;
    }
  }
}

export {};
