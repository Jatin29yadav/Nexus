const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema({
  name: String,
  email: String,
  phone: String,
  membersCount: Number,
  membersName: {
    type: [String],
    default: [],
  },
  bookingType: String,

  bookingTime: {
    start: {
      type: Date,
    },
    end: {
      type: Date,
    },
  },
});

module.exports = mongoose.model("Booking", bookingSchema);
