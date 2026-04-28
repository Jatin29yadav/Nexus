const express = require("express");
const router = express.Router();
const messageController = require("../controllers/message");
const { isLoggedIn, isAdmin } = require("../middleware");

router.post("/", messageController.contactMessage);

router.get("/", isLoggedIn, isAdmin, messageController.getAllMessages);
router.put("/:id/read", isLoggedIn, isAdmin, messageController.markMessageRead);
router.delete("/:id", isLoggedIn, isAdmin, messageController.deleteMessage);

module.exports = router;
