const Station = require("../models/Station");

module.exports.getAllStations = async (req, res) => {
  try {
    const stations = await Station.find()
      .populate("activeBooking", "bookingTime.start bookingTime.end")
      .sort({ stationId: 1 });

    return res.status(200).json({ success: true, stations });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error loading seat map data" });
  }
};
