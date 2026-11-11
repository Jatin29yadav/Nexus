// The one place that signs and verifies the auth JWT.
const jwt = require("jsonwebtoken");

const ALGORITHM = "HS256";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const signAuthToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: TOKEN_TTL_SECONDS,
  });

// Throws on a bad signature, an expired token, or any algorithm other than
// the one we sign with (SEC-09).
const verifyAuthToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });

module.exports = { signAuthToken, verifyAuthToken, TOKEN_TTL_SECONDS, ALGORITHM };
