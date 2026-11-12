// Runs in every test file before the app is loaded.
import path from "node:path";
import dotenv from "dotenv";
import mongoose from "mongoose";
// These modules read no environment variables when loaded; the app (which
// does) is only imported by the test files, after this file has run.
import { User } from "../../src/models/User";
import { Booking } from "../../src/models/Booking";
import { Station } from "../../src/models/Station";
import { Tournament } from "../../src/models/Tournament";
import { Message } from "../../src/models/Message";
import { resetAll } from "../../src/config/rateLimits";

// Rule: tests use .env.test only. Values are loaded, never printed.
dotenv.config({
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
  for (const model of [User, Booking, Station, Tournament, Message]) {
    await model.init();
  }
});

beforeEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  // Rate-limit counters are per process; every test starts from zero.
  await resetAll();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
