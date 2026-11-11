const express = require("express");
const router = express.Router();
const {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
} = require("../controllers/booking");
const { isLoggedIn } = require("../middleware");
const validate = require("../utils/validate");
const { bookingSchema, updateBookingSchema } = require("../validations/zodSchemas");

router.use(isLoggedIn);

router.post("/", validate({ body: bookingSchema }), createBooking);
router.get("/", getAllBookings);
router.get("/:bookingId", getBookingById);
router.put("/:bookingId", validate({ body: updateBookingSchema }), updateBooking);
router.delete("/:bookingId", cancelBooking);

module.exports = router;
