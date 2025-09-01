const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const tournamentSchema = new Schema({
  teamName: {
    type: String,
    required: true,
    trim: true,
  },
  captainName: {
    type: String,
    required: true,
  },
  captainEmail: {
    type: String,
    required: true,
    lowercase: true,
    match: [/.+@.+\..+/, "Please enter a valid email"],
  },
  captainPhone: {
    type: String,
    required: true,
  },
  members: {
    type: [String], // 👈 Instead of array of objects, store names as strings
    default: [],
  },
  registeredAt: {
    type: Date,
    default: Date.now,
  },
});

const Tournament = mongoose.model("Tournament", tournamentSchema);

module.exports = Tournament;
