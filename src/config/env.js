// SEC-10: check configuration once, at boot, and refuse to start when a
// secret is missing or weak. Messages name variables only, never values.
const MIN_JWT_SECRET_LENGTH = 32;

function envProblems(env = process.env) {
  const problems = [];

  if (!env.MONGO_URI) problems.push("MONGO_URI is not set");

  if (!env.JWT_SECRET) {
    problems.push("JWT_SECRET is not set");
  } else if (env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  if (env.NODE_ENV === "production" && !env.FRONTEND_URL && !env.CLIENT_URL) {
    problems.push("FRONTEND_URL is not set (required in production)");
  }

  return problems;
}

function validateEnv(env = process.env) {
  const problems = envProblems(env);
  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration: ${problems.join("; ")}.`);
  }
}

module.exports = { validateEnv, envProblems, MIN_JWT_SECRET_LENGTH };
