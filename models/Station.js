const mongoose = require("mongoose");

const stationSchema = new mongoose.Schema(
  {
    stationId: {
      type: String,
      required: true,
      unique: true, // Example: "PC-01", "C-05"
    },
    type: {
      type: String,
      enum: ["PC", "Console"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Available", "Occupied", "Maintenance", "Offline"],
      default: "Available",
    },
    // Agar koi khel raha hai, toh kis user ko assigned hai
    assignedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Konsi booking filhal is PC par chal rahi hai
    activeBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Station", stationSchema);
