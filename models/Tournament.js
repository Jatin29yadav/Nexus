const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  inGameId: { type: String, required: true },
  phone: { type: String, required: true },
});

const teamSchema = new mongoose.Schema({
  teamName: { type: String, required: true },
  captain: {
    type: mongoose.Schema.Types.ObjectId,
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
  assignedPCs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Station" }],
});

function arrayLimit(val) {
  return val.length >= 5 && val.length <= 6;
}

const tournamentSchema = new mongoose.Schema(
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
    rules: [
      { type: String, default: ["Adhere to Nexus Pro-Circuit Guidelines."] },
    ],

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

module.exports = mongoose.model("Tournament", tournamentSchema);
