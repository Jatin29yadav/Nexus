// SEC-06: per-IP rate limits. Counters live in process memory, which is right
// for a single Render instance; move to a shared store if the API is scaled out.
import { rateLimit, MemoryStore, type Options } from "express-rate-limit";
import type { RequestHandler } from "express";

const MINUTE = 60 * 1000;
const stores: MemoryStore[] = [];

type LimiterOptions = Pick<Options, "windowMs" | "limit"> &
  Partial<Pick<Options, "skipSuccessfulRequests">> & { message: string };

const limiter = ({ windowMs, limit, message, ...rest }: LimiterOptions): RequestHandler => {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    windowMs,
    limit,
    store,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ success: false, message }),
    ...rest,
  });
};

// Every /api request.
export const apiLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 600,
  message: "Too many requests. Please slow down and try again shortly.",
});

// Password guessing: only failed logins count against the limit.
export const loginLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many login attempts. Please try again in 15 minutes.",
});

// Account creation.
export const registerLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 10,
  message: "Too many accounts created from this address. Please try again later.",
});

// Public, unauthenticated write to the database.
export const contactLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 10,
  message: "Too many messages sent. Please try again later.",
});

// Tests only: start every test with empty counters.
export const resetAll = (): Promise<void[]> => Promise.all(stores.map((store) => store.resetAll()));

// Live chat tickets: one per (re)connect; generous for flaky mobile networks.
export const chatTicketLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 60,
  message: "Too many chat connections. Please try again shortly.",
});
