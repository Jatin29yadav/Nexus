const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },

    // 👇 NAYE FIELDS YAHAN ADD HUE HAIN 👇

    // 1. Role for Admin powers
    role: {
      type: String,
      enum: ["User", "Admin"],
      default: "User", // Naya banda hamesha User banega
    },

    // 2. Wishlist for storing favorite PCs (e.g., ["PC-05", "C-02"])
    wishlist: [
      {
        type: String,
      },
    ],

    // 3. User ki past/active bookings ki list (Profile dashboard ke liye)
    bookings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Booking",
      },
    ],
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  const hash = await bcrypt.hash(this.password, 10);
  this.password = hash;
});

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

const User = mongoose.model("User", userSchema);
module.exports = User;
