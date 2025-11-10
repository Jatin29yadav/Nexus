const Booking = require("../models/Booking");
const Setup = require("../models/Setup");
const {
  findAvailableSetups,
  allocateSetups,
  findNextAvailableStart,
} = require("../services/booking.service");

exports.createBooking = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      membersCount,
      membersName,
      bookingType,
      bookingTime,
    } = req.body;

    if (!name || !email || !bookingTime?.start || !bookingTime?.end) {
      return res.status(400).json({
        success: false,
        flashType: "error",
        message: "Missing required fields",
      });
    }

    const bookingStart = new Date(bookingTime.start);
    const bookingEnd = new Date(bookingTime.end);

    // ✅ Find available setups
    const freeSetups = await findAvailableSetups({
      bookingStart,
      bookingEnd,
      type: bookingType,
    });

    if (!freeSetups.length) {
      const nextAvailable = await findNextAvailableStart({
        requestedStart: bookingStart,
        durationMs: bookingEnd - bookingStart,
        type: bookingType,
        slotsRequested: membersCount || 1,
      });

      if (!nextAvailable) {
        return res.status(400).json({
          success: false,
          flashType: "error",
          message: "No setups available at the moment.",
        });
      }

      return res.status(400).json({
        success: false,
        flashType: "info",
        message: `No setups available at this time. Next available slot starts at ${nextAvailable.toLocaleString()}.`,
      });
    }

    // ✅ Allocate setups
    const allocatedIds = await allocateSetups({
      bookingStart,
      bookingEnd,
      type: bookingType,
      slotsRequested: membersCount || 1,
    });

    if (!allocatedIds.length) {
      return res.status(400).json({
        success: false,
        flashType: "error",
        message: "Could not allocate setups. Try again later.",
      });
    }

    // ✅ Save booking
    const booking = new Booking({
      name,
      email,
      phone,
      membersCount,
      membersName,
      bookingType,
      bookingTime: { start: bookingStart, end: bookingEnd },
      setupIds: allocatedIds,
      status: "confirmed",
    });

    await booking.save();

    return res.status(201).json({
      success: true,
      flashType: "success",
      message: "🎮 Booking confirmed successfully!",
      booking,
    });
  } catch (err) {
    console.error("Error creating booking:", err);
    return res.status(500).json({
      success: false,
      flashType: "error",
      message: "Internal server error while creating booking",
    });
  }
};
