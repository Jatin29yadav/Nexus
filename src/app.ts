import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import type { RequestHandler } from "express";
import { rejectOperators } from "./utils/rejectOperators";
import { csrfGuard } from "./utils/csrfGuard";
import { errorHandler } from "./utils/errorHandler";
import { allowedOrigins } from "./config/origins";
import { apiLimiter } from "./config/rateLimits";
import { ExpressError } from "./utils/expressError";

import { userRouter } from "./routes/user";
import { messageRouter } from "./routes/message";
import { tournamentRouter } from "./routes/tournament";
import { bookingRouter } from "./routes/booking";
import { adminRouter } from "./routes/admin";
import { stationRouter } from "./routes/station";

export const app = express();

// Behind Render's proxy (and later Vercel's /api rewrite) the client address is
// in X-Forwarded-For. TRUST_PROXY = number of proxy hops in front of the app;
// defaults to 1 in production and off elsewhere. Rate limiting keys on req.ip.
const trustProxy =
  process.env.TRUST_PROXY !== undefined
    ? Number(process.env.TRUST_PROXY) || 0
    : process.env.NODE_ENV === "production"
      ? 1
      : 0;
if (trustProxy > 0) app.set("trust proxy", trustProxy);

// SEC-08: security headers. This is a JSON-only API, so the CSP allows nothing
// to load or frame it. helmet also removes X-Powered-By.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  }),
);

// SEC-04: object values in query filters are wrapped in $eq unless the code
// marks them with mongoose.trusted(), so user input can never act as an operator.
mongoose.set("sanitizeFilter", true);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// Liveness/readiness for Render's health check. No auth, no rate limit, and
// nothing about the deployment beyond "is the database connected".
const health: RequestHandler = (req, res) => {
  const databaseUp = mongoose.connection.readyState === 1;
  res
    .status(databaseUp ? 200 : 503)
    .set("Cache-Control", "no-store")
    .json({ success: databaseUp, status: databaseUp ? "ok" : "unavailable" });
};
app.get("/health", health);
app.get("/api/health", health);

app.use("/api", apiLimiter);
app.use(csrfGuard);
// JSON only: form-encoded bodies are not parsed (SEC-05). Bodies over 50 kB
// are refused with 413; the largest legitimate payload is a few kB.
app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());
app.use(rejectOperators);

app.use("/api/users", userRouter);
app.use("/api/tournaments", tournamentRouter);
app.use("/api/messages", messageRouter);
app.use("/api/bookings", bookingRouter);
app.use("/api/admin", adminRouter);
app.use("/api/stations", stationRouter);

app.use((req, res, next) => {
  next(new ExpressError(404, "API Endpoint Not Found!"));
});

app.use(errorHandler);
