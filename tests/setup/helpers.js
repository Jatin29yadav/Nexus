const fs = require("fs");
const path = require("path");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const { app } = require("../../src/app");
const { User } = require("../../src/models/User");
const { Booking } = require("../../src/models/Booking");
const { Station } = require("../../src/models/Station");
const { Tournament } = require("../../src/models/Tournament");
const { Message } = require("../../src/models/Message");

const PASSWORD = "Password123!";
let counter = 0;

const api = () => request(app);

const signToken = (userId, options = { expiresIn: "7d" }) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, options);

async function makeUser(overrides = {}) {
  counter += 1;
  const user = await User.create({
    username: `user${counter}`,
    email: `user${counter}@example.test`,
    phone: "9000000000",
    password: PASSWORD,
    ...overrides,
  });
  const token = signToken(user._id);
  return { user, token, cookie: `token=${token}`, password: PASSWORD };
}

const makeAdmin = (overrides = {}) => makeUser({ role: "Admin", ...overrides });

async function seedStations(ids = ["PC-01", "PC-02", "PC-03", "C-01"]) {
  return Station.insertMany(
    ids.map((stationId) => ({
      stationId,
      type: stationId.startsWith("C") ? "Console" : "PC",
    })),
  );
}

const WINDOW = {
  start: "2030-01-10T10:00:00.000Z",
  end: "2030-01-10T12:00:00.000Z",
};

// Exactly what nexus-frontend/src/pages/Booking.jsx sends.
const bookingPayload = (overrides = {}) => ({
  name: "Alex Player",
  email: "alex@example.test",
  phone: "9123456780",
  bookingType: "PC",
  membersCount: 2,
  membersName: ["Alex Player"],
  bookingTime: { ...WINDOW },
  stations: ["PC-01", "PC-02"],
  totalAmount: 400,
  ...overrides,
});

async function makeBooking(owner, overrides = {}) {
  const { stations, ...rest } = bookingPayload(overrides);
  return Booking.create({ user: owner.user._id, stations, ...rest });
}

const players = (n = 5) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Player ${i + 1}`,
    inGameId: `player#${i + 1}`,
    phone: `90000000${String(i).padStart(2, "0")}`,
  }));

async function makeTournament(overrides = {}) {
  return Tournament.create({
    title: "Winter Clash",
    game: "Valorant",
    description: "Test event",
    eventTime: {
      start: "2030-03-01T10:00:00.000Z",
      end: "2030-03-01T18:00:00.000Z",
    },
    maxTeams: 4,
    ...overrides,
  });
}

const makeMessage = (overrides = {}) =>
  Message.create({
    name: "Visitor",
    email: "visitor@example.test",
    subject: "Opening hours",
    message: "What time do you open on Sunday?",
    ...overrides,
  });

// Source files for the static checks. `name` has no extension: the .ts file is
// preferred, the .js one is accepted while the TypeScript migration is running.
const SRC = path.resolve(__dirname, "../../src");
const readSource = (name) => {
  for (const ext of [".ts", ".js"]) {
    const file = path.join(SRC, name + ext);
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  throw new Error(`No source file for ${name}`);
};
// Every file under src/, as [relative path, text].
const allSources = (dir = SRC) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return allSources(full);
    return [[path.relative(SRC, full), fs.readFileSync(full, "utf8")]];
  });

const newId = () => new mongoose.Types.ObjectId().toString();

// `vuln` marks a test that asserts the SECURE behaviour for an open AUDIT.md
// finding. It is expected to fail today (it.fails), so the suite is green now.
// When Phase 3 fixes the finding, Vitest reports the test as failing ("expected
// to fail but passed") — change `vuln(` to `it(` for that test.
// Run `SEC_STRICT=1 npm test` to see the real assertion failures.
const vuln = process.env.SEC_STRICT ? it : it.fails;

module.exports = {
  api,
  app,
  signToken,
  makeUser,
  makeAdmin,
  seedStations,
  bookingPayload,
  makeBooking,
  players,
  makeTournament,
  makeMessage,
  newId,
  readSource,
  allSources,
  vuln,
  PASSWORD,
  WINDOW,
  models: { User, Booking, Station, Tournament, Message },
};
