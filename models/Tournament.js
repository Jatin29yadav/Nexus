const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const tournamentSchema = new Schema({
  teamName: String,
  captainName: String,
  captainEmail: String,
  captainPhone: String,
  members: {
    type: [String],
    default: [],
  },
  registeredAt: {
    type: Date,
    default: Date.now(),
  },
});

const Tournament = mongoose.model("Tournament", tournamentSchema);

module.exports = Tournament;
