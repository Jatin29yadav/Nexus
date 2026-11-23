import { Router } from "express";
import {
  getDashboardData,
  updateStationStatus,
  adminCancelBooking,
} from "../controllers/admin";
import { isLoggedIn, isAdmin } from "../middleware";
import { validate } from "../utils/validate";
import { validateObjectId } from "../utils/validateObjectId";
import { stationStatusSchema } from "../validations/zodSchemas";

export const adminRouter = Router();
const router = adminRouter;

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
