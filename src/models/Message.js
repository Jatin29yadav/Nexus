const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String }, // Optional field for contact sync
  subject: { type: String, default: "No Subject" },
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ["Unread", "Read"], // Frontend uses these
    default: "Unread",
  },
  createdAt: {
    type: Date,
    default: Date.now, // Removed () so it evaluates at creation, not instantly
  },
});

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
