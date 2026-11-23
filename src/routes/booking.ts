import { Router } from "express";
import {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
} from "../controllers/booking";
import { isLoggedIn } from "../middleware";
import { validate } from "../utils/validate";
import { validateObjectId } from "../utils/validateObjectId";
import { bookingSchema, updateBookingSchema } from "../validations/zodSchemas";

export const bookingRouter = Router();
const router = bookingRouter;

router.use(isLoggedIn);
router.param("bookingId", validateObjectId);

router.post("/", validate({ body: bookingSchema }), createBooking);
router.get("/", getAllBookings);
router.get("/:bookingId", getBookingById);
router.put("/:bookingId", validate({ body: updateBookingSchema }), updateBooking);
router.delete("/:bookingId", cancelBooking);
