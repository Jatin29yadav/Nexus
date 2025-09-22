const express = require("express");
const Booking = require("../models/Booking");
const router = express.Router();

const bookingController = require("../controllers/booking.js");

router
  .route("/booking")
  .get(bookingController.renderBookingFrom)
  .post(bookingController.booking);

router.route("/bookings").get(bookingController.bookingsList);

module.exports = router;
