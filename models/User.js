const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true, // usernames should be unique
    trim: true,
    minLength: 3,
  },
  email: {
    type: String,
    required: true,
    unique: true, // emails must be unique
    lowercase: true,
    match: [/.+@.+\..+/, "Please enter a valid email"], // simple regex validation
  },
  password: {
    type: String,
    required: true,
    minLength: 6, // you can adjust this
  },
  phone: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
