const Station = require("../models/Station");
const Booking = require("../models/Booking");
const User = require("../models/User");

module.exports.getDashboardData = async (req, res) => {
  try {
    const [stations, activeBookings, userCount] = await Promise.all([
      Station.find(),
      Booking.find({ status: "Active" }).populate("user", "username email"),
      User.countDocuments({ role: "User" }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalStations: stations.length,
        stationsData: stations,
        activeBookingsCount: activeBookings.length,
        activeBookingsData: activeBookings,
        totalGamers: userCount,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error fetching God Eye data" });
  }
};

module.exports.updateStationStatus = async (req, res) => {
  try {
    const { stationId } = req.params;
    const { status } = req.body;

    const station = await Station.findById(stationId);
    if (!station) {
      return res
        .status(404)
        .json({ success: false, message: "Station not found" });
    }

    station.status = status;
    await station.save();

    return res.status(200).json({
      success: true,
      message: `${station.stationId} is now marked as ${status}`,
      station,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error updating station status" });
  }
};

module.exports.adminCancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId);

    if (!booking)
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });

    if (booking.status === "Cancelled" || booking.status === "Completed") {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status}`,
      });
    }

    booking.status = "Cancelled";
    await booking.save();

    await Station.updateMany(
      { stationId: { $in: booking.stations } },
      {
        $set: { status: "Available", assignedUser: null, activeBooking: null },
      },
    );

    return res.status(200).json({
      success: true,
      message: "Admin forcefully cancelled the booking. Units are now free.",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error cancelling booking" });
  }
};
