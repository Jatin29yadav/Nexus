const express = require("express");
const router = express.Router();
const userController = require("../controllers/user");
const { getUserProfile, toggleWishlist } = require("../controllers/user");
const { isLoggedIn } = require("../middleware");
const validate = require("../utils/validate");
const { loginLimiter, registerLimiter } = require("../config/rateLimits");
const {
  loginSchema,
  registerSchema,
  wishlistSchema,
} = require("../validations/zodSchemas");

router.post("/register", registerLimiter, validate({ body: registerSchema }), userController.registerUser);
router.post("/login", loginLimiter, validate({ body: loginSchema }), userController.loginUser);
router.post("/logout", userController.logoutUser);
router.get("/profile", isLoggedIn, getUserProfile);
router.post("/wishlist", isLoggedIn, validate({ body: wishlistSchema }), toggleWishlist);

module.exports = router;
