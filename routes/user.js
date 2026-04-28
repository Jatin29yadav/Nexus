const express = require("express");
const router = express.Router();
const userController = require("../controllers/user");
const { getUserProfile, toggleWishlist } = require("../controllers/user");
const { isLoggedIn } = require("../middleware");

router.post("/register", userController.registerUser);
router.post("/login", userController.loginUser);
router.post("/logout", userController.logoutUser);
router.get("/profile", isLoggedIn, getUserProfile);
router.post("/wishlist", isLoggedIn, toggleWishlist);

module.exports = router;
