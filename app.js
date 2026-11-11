const express = require("express");
const app = express();

const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const rejectOperators = require("./utils/rejectOperators.js");
const csrfGuard = require("./utils/csrfGuard.js");
const { allowedOrigins } = require("./config/origins.js");
const { apiLimiter } = require("./config/rateLimits.js");
const ExpressError = require("./utils/expressError.js");

const userRouter = require("./routes/user.js");
const messageRoutes = require("./routes/message.js");
const tournamentRouter = require("./routes/tournament.js");
const bookingRouter = require("./routes/booking.js");
const adminRouter = require("./routes/admin.js");
const stationRouter = require("./routes/station.js");

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

app.use("/api", apiLimiter);
app.use(csrfGuard);
// JSON only: form-encoded bodies are not parsed (SEC-05).
app.use(express.json());
app.use(cookieParser());
app.use(rejectOperators);

app.use("/api/users", userRouter);
app.use("/api/tournaments", tournamentRouter);
app.use("/api/messages", messageRoutes);
app.use("/api/bookings", bookingRouter);
app.use("/api/admin", adminRouter);
app.use("/api/stations", stationRouter);

app.use((req, res, next) => {
  next(new ExpressError(404, "API Endpoint Not Found!"));
});

app.use((err, req, res, next) => {
  const { statusCode = 500 } = err;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;
