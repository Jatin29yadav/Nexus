// SEC-15: seed scripts write to whatever database MONGO_URI points at.
// They refuse to run against production unless the operator opts in explicitly.
function assertSafeToSeed(scriptName, env = process.env) {
  if (!env.MONGO_URI) {
    throw new Error(`${scriptName}: MONGO_URI is not set.`);
  }
  if (env.NODE_ENV === "production" && env.ALLOW_PRODUCTION_SEED !== "yes") {
    throw new Error(
      `${scriptName}: refusing to run with NODE_ENV=production. ` +
        "Set ALLOW_PRODUCTION_SEED=yes only if you really mean to seed the production database.",
    );
  }
}

module.exports = { assertSafeToSeed };
