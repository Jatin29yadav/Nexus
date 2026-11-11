const express = require("express");
const router = express.Router();
const messageController = require("../controllers/message");
const { isLoggedIn, isAdmin } = require("../middleware");
const { contactLimiter } = require("../config/rateLimits");
const validateObjectId = require("../utils/validateObjectId");

router.param("id", validateObjectId);

router.post("/", contactLimiter, messageController.contactMessage);

router.get("/", isLoggedIn, isAdmin, messageController.getAllMessages);
router.put("/:id/read", isLoggedIn, isAdmin, messageController.markMessageRead);
router.delete("/:id", isLoggedIn, isAdmin, messageController.deleteMessage);

module.exports = router;
