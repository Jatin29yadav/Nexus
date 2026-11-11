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

// ── Admin actions ───────────────────────────────────────────────────────
const stationStatusSchema = z.object({
  status: z.enum(["Available", "Occupied", "Maintenance", "Offline"], "Invalid station status"),
});

const teamStatusSchema = z.object({
  status: z.enum(["Pending", "Approved", "Rejected"], "Invalid team status"),
});

// A player's `email` is sent by the form but not stored (contract M-08): stripped.
const playerValidation = z.object(
  {
    name: z.string("Player name is required").trim().min(2, "Player name must be at least 2 characters").max(80, "Player name is too long"),
    inGameId: z.string("In-game ID is required").trim().min(2, "In-game ID is required").max(80, "In-game ID is too long"),
    phone,
  },
  "Each player needs a name, in-game ID and phone number",
);

const teamRegistrationSchema = z.object({
  teamName: z
    .string("Team name is required")
    .trim()
    .min(2, "Team name too short")
    .max(40, "Team name too long"),
  players: z
    .array(playerValidation, "A team must have exactly 5 or 6 players")
    .min(5, "A team must have exactly 5 or 6 players")
    .max(6, "A team must have exactly 5 or 6 players"),
});

// ── Tournaments ─────────────────────────────────────────────────────────
const eventWindow = z
  .object({ start: isoDate("start"), end: isoDate("end") }, "Event time is required")
  .refine((t) => new Date(t.end) > new Date(t.start), "End time must be after start time");

const text = (label, max) =>
  z
    .string({
      error: (issue) =>
        issue.input === undefined ? `${label} is required` : `${label} must be text`,
    })
    .trim()
    .max(max, `${label} is too long`);

const tournamentFields = {
  title: text("Title", 120).min(1, "Title is required"),
  game: text("Game", 80).min(1, "Game is required"),
  description: text("Description", 5000),
  eventTime: eventWindow,
  // The admin form may send this as a string (contract M-17).
  maxTeams: z.coerce
    .number("Max teams must be a number")
    .int("Max teams must be a whole number")
    .min(1, "Max teams must be at least 1")
    .max(256, "Max teams is too large"),
  status: z.enum(
    ["Upcoming", "Registration Open", "Live", "Completed", "Cancelled"],
    "Invalid tournament status",
  ),
  prize: text("Prize", 120),
  entryFee: text("Entry fee", 120),
  format: text("Format", 120),
  thumbnail: text("Thumbnail", 500).regex(/^https?:\/\//i, "Thumbnail must be an http(s) URL"),
  rules: z.array(text("Rule", 500), "Rules must be a list").max(50, "Too many rules"),
};

const createTournamentSchema = z.object({
  title: tournamentFields.title,
  game: tournamentFields.game,
  description: tournamentFields.description.optional(),
  eventTime: tournamentFields.eventTime,
  maxTeams: tournamentFields.maxTeams,
});

// Every field optional; unknown keys (the edit form's selectedDate, startTime,
// endTime — contract M-16) are stripped.
const updateTournamentSchema = z.object(tournamentFields).partial();

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
  stationStatusSchema,
  teamStatusSchema,
  playerValidation,
  teamRegistrationSchema,
  createTournamentSchema,
  updateTournamentSchema,
  messageSchema,
};
