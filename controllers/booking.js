const Booking = require("../models/Booking");
const Station = require("../models/Station");
const Tournament = require("../models/Tournament");

module.exports.createBooking = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      bookingType,
      membersCount,
      membersName,
      bookingTime,
      stations,
      totalAmount,
    } = req.body;

    const clashingTournament = await Tournament.findOne({
      status: { $in: ["Upcoming", "Registration Open", "Live"] },
      "eventTime.start": { $lt: new Date(bookingTime.end) },
      "eventTime.end": { $gt: new Date(bookingTime.start) },
    });

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
      totalAmount,
    });

    await newBooking.save();

    await Station.updateMany(
      { stationId: { $in: stations } },
      {
        $set: {
          status: "Occupied",
          assignedUser: req.user._id,
          activeBooking: newBooking._id,
        },
      },
    );

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
    const bookings = await Booking.find()
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

    if (
      req.user.role !== "Admin" &&
      booking.user.toString() !== req.user._id.toString()
    ) {
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

    if (
      req.user.role !== "Admin" &&
      booking.user.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    // Free the stations
    await Station.updateMany(
      { stationId: { $in: booking.stations } },
      {
        $set: { status: "Available", assignedUser: null, activeBooking: null },
      },
    );

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

    if (
      req.user.role !== "Admin" &&
      booking.user.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: "Forbidden." });
    }

    const { phone, bookingTime, totalAmount } = req.body;
    booking.phone = phone || booking.phone;
    if (bookingTime) booking.bookingTime = bookingTime;
    if (totalAmount) booking.totalAmount = totalAmount;

    await booking.save();
    return res
      .status(200)
      .json({ success: true, message: "Re-calibrated!", booking });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Update failed." });
  }
};
