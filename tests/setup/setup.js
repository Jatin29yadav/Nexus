// Runs in every test file before the app is loaded.
// TEMPORARY (TypeScript migration): the JS tests load src/ through Node's own
// require(), which cannot read .ts files. tsx's hook teaches it to.
if (!globalThis.__nexusTsxRegistered) {
  require("tsx/cjs/api").register();
  globalThis.__nexusTsxRegistered = true;
}
const path = require("path");
const mongoose = require("mongoose");

// Rule: tests use .env.test only. Values are loaded, never printed.
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.test"),
  quiet: true,
});

const memoryUri = process.env.TEST_MONGO_URI;
if (!memoryUri || !/^mongodb:\/\/127\.0\.0\.1:/.test(memoryUri)) {
  throw new Error("Refusing to run: in-memory MongoDB URI is missing.");
}

// Whatever .env.test says, the only database tests can reach is the in-memory one.
process.env.MONGO_URI = memoryUri;
// Deterministic values the assertions rely on.
process.env.FRONTEND_URL = "https://frontend.example.test";
delete process.env.CLIENT_URL; // old name; must not influence tests
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-only-secret-not-used-anywhere-else";
}

beforeAll(async () => {
  await mongoose.connect(memoryUri, { dbName: `nexus_test_${process.pid}` });
  // Load every model and build its indexes (unique email, username, stationId).
  for (const name of ["User", "Booking", "Station", "Tournament", "Message"]) {
    await require(`../../src/models/${name}`)[name].init();
  }
});

beforeEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  // Rate-limit counters are per process; every test starts from zero.
  await require("../../src/config/rateLimits").resetAll();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
