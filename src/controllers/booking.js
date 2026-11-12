const mongoose = require("mongoose");
const { Booking } = require("../models/Booking");
const { Station } = require("../models/Station");
const { Tournament } = require("../models/Tournament");

const PRICE_PER_PLAYER_HOUR = 100;

// SEC-03: the price is always computed here, never taken from the client.
const priceFor = (membersCount, bookingTime) => {
  const hours = (new Date(bookingTime.end) - new Date(bookingTime.start)) / (60 * 60 * 1000);
  return Math.round((membersCount || 1) * hours * PRICE_PER_PLAYER_HOUR);
};

const findClashingTournament = (bookingTime) =>
  Tournament.findOne({
    // Operators written by us, not the client: mark them trusted (sanitizeFilter).
    status: mongoose.trusted({ $in: ["Upcoming", "Registration Open", "Live"] }),
    "eventTime.start": mongoose.trusted({ $lt: new Date(bookingTime.end) }),
    "eventTime.end": mongoose.trusted({ $gt: new Date(bookingTime.start) }),
  });

const releaseStations = (filter) =>
  Station.updateMany(filter, {
    $set: { status: "Available", assignedUser: null, activeBooking: null },
  });

// SEC-17: the single ownership rule for bookings. Works whether `booking.user`
// is an ObjectId or a populated user document.
const isOwnerOrAdmin = (booking, user) => {
  if (user.role === "Admin") return true;
  const ownerId = booking.user && booking.user._id ? booking.user._id : booking.user;
  return String(ownerId) === String(user._id);
};

module.exports.createBooking = async (req, res) => {
  try {
    // req.body has been validated and stripped by bookingSchema.
    const {
      name,
      email,
      phone,
      bookingType,
      membersCount,
      membersName,
      bookingTime,
      stations,
    } = req.body;

    const clashingTournament = await findClashingTournament(bookingTime);

    if (clashingTournament) {
      return res.status(400).json({
        success: false,
        message: `Cafe is reserved for '${clashingTournament.title}'.`,
      });
    }

    const newBooking = new Booking({
      user: req.user._id,
      stations: stations,
      name,
      email,
      phone,
      bookingType,
      membersCount,
      membersName,
      bookingTime,
      totalAmount: priceFor(membersCount, bookingTime),
    });

    // Claim the stations atomically: only stations that exist AND are still
    // Available match, so a concurrent request cannot take the same one.
    const claim = await Station.updateMany(
      { stationId: mongoose.trusted({ $in: stations }), status: "Available" },
      {
        $set: {
          status: "Occupied",
          assignedUser: req.user._id,
          activeBooking: newBooking._id,
        },
      },
    );

    if (claim.modifiedCount !== stations.length) {
      await releaseStations({ activeBooking: newBooking._id });
      return res.status(409).json({
        success: false,
        message: "One or more selected stations are not available.",
      });
    }

    try {
      await newBooking.save();
    } catch (saveError) {
      await releaseStations({ activeBooking: newBooking._id });
      throw saveError;
    }

    return res.status(201).json({
      success: true,
      message: "Deployment Confirmed!",
      booking: newBooking,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong while booking!" });
  }
};

module.exports.getAllBookings = async (req, res) => {
  try {
    // SEC-01: customers only ever see their own bookings; admins see all.
    const filter = req.user.role === "Admin" ? {} : { user: req.user._id };
    const bookings = await Booking.find(filter)
      .populate("user", "username email")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, bookings });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Sync Error." });
  }
};

module.exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate(
      "user",
      "username",
    );
    if (!booking)
      return res.status(404).json({ success: false, message: "Not found" });

    if (!isOwnerOrAdmin(booking, req.user)) {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden Access." });
    }
    return res.status(200).json({ success: true, booking });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error." });
  }
};

module.exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking)
      return res.status(404).json({ success: false, message: "Not found." });

    if (!isOwnerOrAdmin(booking, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    // Free the stations
    await releaseStations({ stationId: mongoose.trusted({ $in: booking.stations }) });

    await Booking.findByIdAndDelete(req.params.bookingId);
    return res
      .status(200)
      .json({ success: true, message: "Deployment Aborted." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Delete failed." });
  }
};

module.exports.updateBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking)
      return res.status(404).json({ success: false, message: "Not found" });

    if (!isOwnerOrAdmin(booking, req.user)) {
      return res.status(403).json({ success: false, message: "Forbidden." });
    }

    const { phone, bookingTime } = req.body;
    booking.phone = phone || booking.phone;
    if (bookingTime) {
      const clashingTournament = await findClashingTournament(bookingTime);
      if (clashingTournament) {
        return res.status(400).json({
          success: false,
          message: `Cafe is reserved for '${clashingTournament.title}'.`,
        });
      }
      booking.bookingTime = bookingTime;
      booking.totalAmount = priceFor(booking.membersCount, bookingTime);
    }

    await booking.save();
    return res
      .status(200)
      .json({ success: true, message: "Re-calibrated!", booking });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Update failed." });
  }
};
