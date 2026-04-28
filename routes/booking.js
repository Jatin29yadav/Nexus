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

router.use(isLoggedIn);

router.post("/", createBooking);
router.get("/", getAllBookings);
router.get("/:bookingId", getBookingById);
router.put("/:bookingId", updateBooking);
router.delete("/:bookingId", cancelBooking);

module.exports = router;
