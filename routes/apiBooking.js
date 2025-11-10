const express = require("express");
const router = express.Router();
const apiBookingController = require("../controllers/apiBookingController.js");

router.post("/", apiBookingController.createBooking);

module.exports = router;
