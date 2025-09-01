const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      match: [/.+@.+\..+/, "Please enter a valid email"],
      lowercase: true,
    },
    phone: {
      type: String, // better to keep phone as string (leading 0s & country codes possible)
      required: [true, "Phone number is required"],
      match: [/^\d{10}$/, "Phone number must be 10 digits"],
    },
    membersCount: {
      type: Number,
      default: 1,
      min: [1, "At least 1 member required"],
    },
    membersName: {
      type: [String],
      default: [],
    },

    // Type of booking: PC or VR
    bookingType: {
      type: String,
      enum: ["PC", "VR"],
      required: [true, "Booking type is required"],
    },

    // Booking time details
    bookingTime: {
      start: {
        type: Date,
        required: [true, "Start time is required"],
      },
      end: {
        type: Date,
        required: [true, "End time is required"],
      },
    },

    // Optional: which setup (like PC ID or VR room)
    setupId: {
      type: String,
      default: null,
    },

    // Status of booking
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
