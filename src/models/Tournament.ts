import { model, Schema, type HydratedDocument, type Model, type Types } from "mongoose";
import type { IPlayer, ITeam, ITournament } from "../types/domain";

const playerSchema = new Schema<IPlayer>({
  name: { type: String, required: true },
  inGameId: { type: String, required: true },
  phone: { type: String, required: true },
});

function arrayLimit(val: IPlayer[]): boolean {
  return val.length >= 5 && val.length <= 6;
}

const teamSchema = new Schema<ITeam>({
  teamName: { type: String, required: true },
  captain: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  players: {
    type: [playerSchema],
    validate: [arrayLimit, "A team must have exactly 5 or 6 players"],
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },
  assignedPCs: [{ type: Schema.Types.ObjectId, ref: "Station" }],
});

// Hydrated tournaments hold their teams in a DocumentArray (.id(), .pull()).
type TournamentOverrides = { registeredTeams: Types.DocumentArray<ITeam> };
type TournamentModel = Model<ITournament, object, TournamentOverrides>;

const tournamentSchema = new Schema<ITournament, TournamentModel>(
  {
    title: { type: String, required: true },
    game: { type: String, required: true },
    description: { type: String },

    prize: { type: String, default: "TBD" },
    entryFee: { type: String, default: "Free" },
    format: { type: String, default: "5v5 Standard" },
    thumbnail: {
      type: String,
      default: "https://images.unsplash.com/photo-1542751371-adc38448a05e",
    },
    rules: [{ type: String, default: ["Adhere to Nexus Pro-Circuit Guidelines."] }],

    eventTime: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    maxTeams: { type: Number, required: true },
    registeredTeams: [teamSchema],
    status: {
      type: String,
      enum: ["Upcoming", "Registration Open", "Live", "Completed", "Cancelled"],
      default: "Upcoming",
    },
  },
  { timestamps: true },
);

export const Tournament = model<ITournament, TournamentModel>("Tournament", tournamentSchema);
export type TournamentDocument = HydratedDocument<ITournament, TournamentOverrides>;
