const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const {
  getDashboardData,
  updateStationStatus,
  adminCancelBooking,
} = require("../controllers/admin");
const { isLoggedIn, isAdmin } = require("../middleware");

const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(adminRateLimiter);

router.get("/dashboard", isLoggedIn, isAdmin, getDashboardData);
router.put("/station/:stationId", isLoggedIn, isAdmin, updateStationStatus);

router.put(
  "/booking/:bookingId/cancel",
  isLoggedIn,
  isAdmin,
  adminCancelBooking,
);

module.exports = router;
