import fs from "node:fs";
import path from "node:path";
import request, { type Response } from "supertest";
import jwt, { type SignOptions } from "jsonwebtoken";
import mongoose, { type Types } from "mongoose";

import { app } from "../../src/app";
import { User, type UserDocument } from "../../src/models/User";
import { Booking } from "../../src/models/Booking";
import { Station } from "../../src/models/Station";
import { Tournament } from "../../src/models/Tournament";
import { Message } from "../../src/models/Message";
import type { BookingBody } from "../../src/types/requests";

export const PASSWORD = "Password123!";
let counter = 0;

export const api = () => request(app);

export const signToken = (
  userId: Types.ObjectId | string,
  options: SignOptions = { expiresIn: "7d" },
): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set for the tests");
  return jwt.sign({ userId }, secret, options);
};

export interface TestUser {
  user: UserDocument;
  token: string;
  cookie: string;
  password: string;
}

export async function makeUser(overrides: Record<string, unknown> = {}): Promise<TestUser> {
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

export const makeAdmin = (overrides: Record<string, unknown> = {}) =>
  makeUser({ role: "Admin", ...overrides });

export async function seedStations(ids = ["PC-01", "PC-02", "PC-03", "C-01"]) {
  return Station.insertMany(
    ids.map((stationId) => ({
      stationId,
      type: stationId.startsWith("C") ? "Console" : "PC",
    })),
  );
}

export const WINDOW = {
  start: "2030-01-10T10:00:00.000Z",
  end: "2030-01-10T12:00:00.000Z",
};

/** Exactly what nexus-frontend/src/pages/Booking.jsx sends (incl. the ignored totalAmount). */
export type BookingPayload = BookingBody & { totalAmount: number };

export const bookingPayload = (overrides: Record<string, unknown> = {}): BookingPayload => ({
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

export async function makeBooking(owner: TestUser, overrides: Record<string, unknown> = {}) {
  const { stations, ...rest } = bookingPayload(overrides);
  return Booking.create({ user: owner.user._id, stations, ...rest });
}

export const players = (n = 5) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Player ${i + 1}`,
    inGameId: `player#${i + 1}`,
    phone: `90000000${String(i).padStart(2, "0")}`,
  }));

export async function makeTournament(overrides: Record<string, unknown> = {}) {
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

export const makeMessage = (overrides: Record<string, unknown> = {}) =>
  Message.create({
    name: "Visitor",
    email: "visitor@example.test",
    subject: "Opening hours",
    message: "What time do you open on Sunday?",
    ...overrides,
  });

/** The HTTP methods the route tables use; api()[method] works for each. */
export type Method = "get" | "post" | "put" | "delete";

/** A response's Set-Cookie headers ([] when there are none). */
export const cookiesOf = (res: Response): string[] => {
  const header: unknown = res.headers["set-cookie"];
  return Array.isArray(header) ? header.filter((c): c is string => typeof c === "string") : [];
};

/** The first Set-Cookie header. Throws when there is none, as `undefined[0]` did. */
export const firstCookie = (res: Response): string => {
  const [cookie] = cookiesOf(res);
  if (cookie === undefined) throw new Error("response has no Set-Cookie header");
  return cookie;
};

/** "token=<jwt>" from the first Set-Cookie header, without its attributes. */
export const cookiePair = (res: Response): string => firstCookie(res).split(";")[0] ?? "";

export const newId = () => new mongoose.Types.ObjectId().toString();

// Source files for the static checks. `name` has no extension: the .ts file is
// preferred; a .js file is still accepted.
const SRC = path.resolve(__dirname, "../../src");
export const readSource = (name: string): string => {
  for (const ext of [".ts", ".js"]) {
    const file = path.join(SRC, name + ext);
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  throw new Error(`No source file for ${name}`);
};
// Every file under src/, as [relative path, text].
export const allSources = (dir = SRC): Array<[string, string]> =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry): Array<[string, string]> => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return allSources(full);
    return [[path.relative(SRC, full), fs.readFileSync(full, "utf8")]];
  });

// `vuln` marks a test that asserts the SECURE behaviour for an open AUDIT.md
// finding. It is expected to fail today (it.fails), so the suite is green now.
// When Phase 3 fixes the finding, Vitest reports the test as failing ("expected
// to fail but passed") — change `vuln(` to `it(` for that test.
// Run `SEC_STRICT=1 npm test` to see the real assertion failures.
export const vuln = process.env.SEC_STRICT ? it : it.fails;

export const models = { User, Booking, Station, Tournament, Message };
export { app };
