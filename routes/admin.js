const express = require("express");
const router = express.Router();
const {
  getDashboardData,
  updateStationStatus,
  adminCancelBooking,
} = require("../controllers/admin");
const { isLoggedIn, isAdmin } = require("../middleware");

router.get("/dashboard", isLoggedIn, isAdmin, getDashboardData);
router.put("/station/:stationId", isLoggedIn, isAdmin, updateStationStatus);

router.put(
  "/booking/:bookingId/cancel",
  isLoggedIn,
  isAdmin,
  adminCancelBooking,
);

module.exports = router;
