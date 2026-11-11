// The one place that signs and verifies the auth JWT.
const jwt = require("jsonwebtoken");
const ExpressError = require("./expressError");

const ALGORITHM = "HS256";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// server.js refuses to boot without JWT_SECRET (config/env.js). Should it go
// missing anyway, fail with a fixed message instead of library internals.
const secret = () => {
  if (!process.env.JWT_SECRET) {
    throw new ExpressError(500, "Server configuration error.");
  }
  return process.env.JWT_SECRET;
};

const signAuthToken = (userId) =>
  jwt.sign({ userId }, secret(), {
    algorithm: ALGORITHM,
    expiresIn: TOKEN_TTL_SECONDS,
  });

// Throws on a bad signature, an expired token, or any algorithm other than
// the one we sign with (SEC-09).
const verifyAuthToken = (token) =>
  jwt.verify(token, secret(), { algorithms: [ALGORITHM] });

module.exports = { signAuthToken, verifyAuthToken, TOKEN_TTL_SECONDS, ALGORITHM };
