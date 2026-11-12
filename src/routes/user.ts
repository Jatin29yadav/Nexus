import { Router } from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  getUserProfile,
  toggleWishlist,
} from "../controllers/user";
import { isLoggedIn } from "../middleware";
import { validate } from "../utils/validate";
import { loginLimiter, registerLimiter } from "../config/rateLimits";
import { loginSchema, registerSchema, wishlistSchema } from "../validations/zodSchemas";

export const userRouter = Router();
const router = userRouter;

router.post("/register", registerLimiter, validate({ body: registerSchema }), registerUser);
router.post("/login", loginLimiter, validate({ body: loginSchema }), loginUser);
router.post("/logout", logoutUser);
router.get("/profile", isLoggedIn, getUserProfile);
router.post("/wishlist", isLoggedIn, validate({ body: wishlistSchema }), toggleWishlist);
