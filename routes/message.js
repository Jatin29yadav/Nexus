const Message = require("../models/Message.js");
const express = require("express");
const router = express.Router();

const messageController = require("../controllers/message.js");

router
  .route("/")
  .get(messageController.renderContactForm)
  .post(messageController.contactMessage);

module.exports = router;
