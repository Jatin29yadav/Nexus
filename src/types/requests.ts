// Request types. Bodies are derived from the Zod schemas that validate them
// (utils/validate.ts replaces req.body with the parsed value), so a schema
// change is a type change. Params are the route's named segments; their
// ObjectId shape is checked by utils/validateObjectId.ts.
import type { z } from "zod";
import type {
  bookingSchema,
  createTournamentSchema,
  loginSchema,
  messageSchema,
  registerSchema,
  stationStatusSchema,
  teamRegistrationSchema,
  teamStatusSchema,
  updateBookingSchema,
  updateTournamentSchema,
  wishlistSchema,
} from "../validations/zodSchemas";

export type LoginBody = z.infer<typeof loginSchema>;
export type RegisterBody = z.infer<typeof registerSchema>;
export type WishlistBody = z.infer<typeof wishlistSchema>;
export type BookingBody = z.infer<typeof bookingSchema>;
export type UpdateBookingBody = z.infer<typeof updateBookingSchema>;
export type StationStatusBody = z.infer<typeof stationStatusSchema>;
export type TeamStatusBody = z.infer<typeof teamStatusSchema>;
export type TeamRegistrationBody = z.infer<typeof teamRegistrationSchema>;
export type CreateTournamentBody = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentBody = z.infer<typeof updateTournamentSchema>;
export type MessageBody = z.infer<typeof messageSchema>;

/** A start/end pair as the client sends it (ISO strings) or as stored (Dates). */
export interface TimeWindow {
  start: string | Date;
  end: string | Date;
}

export type BookingParams = { bookingId: string };
export type StationParams = { stationId: string };
export type TournamentParams = { tournamentId: string };
export type TeamParams = { tournamentId: string; teamId: string };
export type MessageParams = { id: string };
