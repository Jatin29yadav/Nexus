const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stations: [
      {
        type: String,
        required: true,
      },
    ],

    name: String,
    email: String,
    phone: String,
    bookingType: {
      type: String,
      enum: ["PC", "Console"],
      required: true,
    },
    membersCount: Number,
    membersName: [String],
    bookingTime: {
      start: Date,
      end: Date,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Active", "Completed", "Cancelled"],
      default: "Active",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Booking", bookingSchema);
