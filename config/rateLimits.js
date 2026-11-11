// SEC-06: per-IP rate limits. Counters live in process memory, which is right
// for a single Render instance; move to a shared store if the API is scaled out.
const { rateLimit, MemoryStore } = require("express-rate-limit");

const MINUTE = 60 * 1000;
const stores = [];

const limiter = ({ windowMs, limit, message, ...rest }) => {
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
const apiLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 600,
  message: "Too many requests. Please slow down and try again shortly.",
});

// Password guessing: only failed logins count against the limit.
const loginLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many login attempts. Please try again in 15 minutes.",
});

// Account creation.
const registerLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 10,
  message: "Too many accounts created from this address. Please try again later.",
});

// Public, unauthenticated write to the database.
const contactLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 10,
  message: "Too many messages sent. Please try again later.",
});

// Tests only: start every test with empty counters.
const resetAll = () => Promise.all(stores.map((store) => store.resetAll()));

module.exports = { apiLimiter, loginLimiter, registerLimiter, contactLimiter, resetAll };
