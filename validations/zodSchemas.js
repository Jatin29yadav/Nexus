const { z } = require("zod");

const bookingSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  phone: z.string().length(10, "Phone number must be 10 digits"),
  bookingType: z.enum(["PC", "Console"], "Please select either PC or Console"),
  membersCount: z.number().int().positive().min(1),
  membersName: z
    .array(z.string())
    .nonempty("At least one member name is required"),
  bookingTime: z.object({
    start: z.string().datetime("Invalid start time format"),
    end: z.string().datetime("Invalid end time format"),
  }),
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
  bookingSchema,
  stationSchema,
  playerValidation,
  teamRegistrationSchema,
  createTournamentSchema,
  messageSchema,
};
