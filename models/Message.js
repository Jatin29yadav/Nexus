const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema({
  name: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  email: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  message: String,
  createdAt: {
    type: Date,
    default: Date.now(),
  },
});

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
