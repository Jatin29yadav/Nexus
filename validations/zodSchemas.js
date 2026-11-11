const { z } = require("zod");

// ── Shared pieces ───────────────────────────────────────────────────────
const phone = z
  .string("Phone number is required")
  .trim()
  .regex(/^\+?[0-9\s\-()]{7,20}$/, "Phone number is not valid");

const isoDate = (label) => z.iso.datetime({ offset: true, error: `Invalid ${label} time` });

const MAX_BOOKING_HOURS = 24;
const timeWindow = z
  .object(
    { start: isoDate("start"), end: isoDate("end") },
    "Booking time is required",
  )
  .refine((t) => new Date(t.end) > new Date(t.start), "End time must be after start time")
  .refine(
    (t) => new Date(t.end) - new Date(t.start) <= MAX_BOOKING_HOURS * 60 * 60 * 1000,
    `A booking cannot be longer than ${MAX_BOOKING_HOURS} hours`,
  );

// ── Users ───────────────────────────────────────────────────────────────
// SEC-04: every credential is a plain, bounded string before it reaches a query.
const credential = (label, max) =>
  z.string(`${label} is required`).min(1, `${label} is required`).max(max, `${label} is too long`);

const loginSchema = z.object({
  email: credential("Email", 254),
  password: credential("Password", 128),
});

// SEC-11: registration policy. Login stays lenient on purpose so that accounts
// created before this policy can still sign in.
const registerSchema = z.object({
  username: z
    .string("Username is required")
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[A-Za-z0-9 _.-]+$/, "Username can only contain letters, numbers, spaces, _ . and -"),
  email: z.email("Invalid email format").max(254, "Email is too long"),
  password: z
    .string("Password is required")
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  phone: phone.optional(),
});

// ── Bookings ────────────────────────────────────────────────────────────
// `totalAmount` is deliberately absent: the server computes it (SEC-03), and
// unknown keys are stripped.
const bookingSchema = z
  .object({
    name: z.string("Name is required").trim().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
    email: z.email("Invalid email format").max(254, "Email is too long"),
    phone,
    bookingType: z.enum(["PC", "Console"], "Please select either PC or Console"),
    membersCount: z
      .number("Number of players is required")
      .int("Number of players must be a whole number")
      .min(1, "At least one player is required")
      .max(60, "Too many players"),
    membersName: z.array(z.string().trim().min(1).max(80)).max(60).default([]),
    bookingTime: timeWindow,
    stations: z
      .array(
        z.string("Invalid station id").regex(/^[A-Za-z0-9-]{1,10}$/, "Invalid station id"),
        "Select at least one station",
      )
      .min(1, "Select at least one station")
      .max(60, "Too many stations"),
  })
  .refine((b) => new Set(b.stations).size === b.stations.length, "A station was selected twice")
  .refine((b) => b.stations.length <= b.membersCount, "You cannot book more stations than players");

const updateBookingSchema = z.object({
  phone: phone.optional(),
  bookingTime: timeWindow.optional(),
});

const stationSchema = z.object({
  stationId: z.string().trim().min(3).max(10),
  type: z.enum(["PC", "Console"]),
  status: z
    .enum(["Available", "Occupied", "Maintenance", "Offline"])
    .default("Available"),
  installedGames: z.array(z.string()).optional(),
});

const playerValidation = z.object({
  name: z.string().min(2, "Player name must be at least 2 characters"),
  inGameId: z.string().min(2, "In-game ID is required"),
  phone: z.string().length(10, "Phone number must be exactly 10 digits"),
});

const teamRegistrationSchema = z.object({
  teamName: z
    .string()
    .min(3, "Team name too short")
    .max(30, "Team name too long"),
  players: z
    .array(playerValidation)
    .min(5, "You need exactly 5 main players")
    .max(6, "You can only have up to 1 substitute player (Total 6)"),
});

const createTournamentSchema = z.object({
  title: z.string().min(5, "Tournament title must be at least 5 characters"),
  game: z.string().min(2, "Game name is required"),
  description: z.string().optional(),
  eventTime: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  maxTeams: z.number().int().positive("Max teams must be a valid number"),
});

const messageSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10, "Message must be at least 10 characters long"),
});

module.exports = {
  loginSchema,
  registerSchema,
  bookingSchema,
  updateBookingSchema,
  stationSchema,
  playerValidation,
  teamRegistrationSchema,
  createTournamentSchema,
  messageSchema,
};
