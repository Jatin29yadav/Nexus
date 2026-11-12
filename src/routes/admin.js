const express = require("express");
const router = express.Router();
const {
  getDashboardData,
  updateStationStatus,
  adminCancelBooking,
} = require("../controllers/admin");
const { isLoggedIn, isAdmin } = require("../middleware");
const { validate } = require("../utils/validate");
const { validateObjectId } = require("../utils/validateObjectId");
const { stationStatusSchema } = require("../validations/zodSchemas");

router.param("stationId", validateObjectId);
router.param("bookingId", validateObjectId);

router.get("/dashboard", isLoggedIn, isAdmin, getDashboardData);
router.put(
  "/station/:stationId",
  isLoggedIn,
  isAdmin,
  validate({ body: stationStatusSchema }),
  updateStationStatus,
);

router.put(
  "/booking/:bookingId/cancel",
  isLoggedIn,
  isAdmin,
  adminCancelBooking,
);

module.exports = router;
