const axios = require("axios");
const Booking = require("../models/Booking");

module.exports.renderBookingFrom = (req, res) => {
  res.render("booking/booking.ejs");
};

module.exports.booking = async (req, res) => {
  try {
    // 🔗 Call internal API instead of duplicating booking logic
    const baseURL = process.env.BASE_URL || "http://localhost:3005";

    const response = await axios.post(`${baseURL}/api/bookings`, req.body);

    // ✅ If API succeeded
    if (response.data.success) {
      req.flash("success", response.data.message || "🎮 Booking successful!");
      return res.redirect("/bookings");
    }

    // ⚠️ If API failed but returned a message
    req.flash("error", response.data.message || "Failed to create booking.");
    res.redirect("/booking");
  } catch (error) {
    console.error("Booking error:", error.response?.data || error.message);
    req.flash("error", "Something went wrong while booking!");
    res.redirect("/booking");
  }
};

module.exports.bookingsList = async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.render("booking/bookingList.ejs", { bookings });
  } catch (err) {
    console.error(err);
    req.flash("error", "Error fetching bookings");
    res.redirect("/");
  }
};
