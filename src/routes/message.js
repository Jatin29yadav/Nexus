const express = require("express");
const router = express.Router();
const messageController = require("../controllers/message");
const { isLoggedIn, isAdmin } = require("../middleware");
const { contactLimiter } = require("../config/rateLimits");
const { validateObjectId } = require("../utils/validateObjectId");
const { validate } = require("../utils/validate");
const { messageSchema } = require("../validations/zodSchemas");

router.param("id", validateObjectId);

router.post(
  "/",
  contactLimiter,
  validate({ body: messageSchema }),
  messageController.contactMessage,
);

router.get("/", isLoggedIn, isAdmin, messageController.getAllMessages);
router.put("/:id/read", isLoggedIn, isAdmin, messageController.markMessageRead);
router.delete("/:id", isLoggedIn, isAdmin, messageController.deleteMessage);

module.exports = router;
