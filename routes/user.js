const express = require("express");
const router = express.Router();
const userController = require("../controllers/user");
const { getUserProfile, toggleWishlist } = require("../controllers/user");
const { isLoggedIn } = require("../middleware");
const validate = require("../utils/validate");
const { loginSchema, registerSchema } = require("../validations/zodSchemas");

router.post("/register", validate({ body: registerSchema }), userController.registerUser);
router.post("/login", validate({ body: loginSchema }), userController.loginUser);
router.post("/logout", userController.logoutUser);
router.get("/profile", isLoggedIn, getUserProfile);
router.post("/wishlist", isLoggedIn, toggleWishlist);

module.exports = router;
