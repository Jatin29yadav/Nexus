import bcrypt from "bcryptjs";
import { User, type UserDocument } from "../models/User";
import { signAuthToken } from "../utils/authToken";
import { setAuthCookie, clearAuthCookie } from "../utils/authCookie";
import { currentUser, tokenCookie, userForToken } from "../middleware";
import { isRecord, messageOf } from "../utils/narrow";
import type { ApiHandler, ParamsDictionary } from "../types/api";
import type { LoginBody, RegisterBody, WishlistBody } from "../types/requests";

// Compared against when the email is unknown, so "no such user" costs the same
// bcrypt round as "wrong password" and cannot be told apart by timing.
const DUMMY_HASH = bcrypt.hashSync("nexus-timing-equaliser", 10);

// What login and register return. Includes `role` and `phone` so the client
// knows straight away whether this is an admin (ML-011), without a reload.
const sessionUser = (user: UserDocument) => ({
  _id: user._id,
  email: user.email,
  username: user.username,
  phone: user.phone,
  role: user.role,
});

export const registerUser: ApiHandler<ParamsDictionary, RegisterBody> = async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    const isExist = await User.findOne({ email });

    if (isExist) {
      return res.status(422).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    // Sign before saving: if signing fails no half-registered account is left.
    const user = new User({ email, username, phone, password });
    signAuthToken(user._id); // throws on a missing secret, before anything is stored
    await user.save();

    setAuthCookie(res, user);

    return res.status(201).json({
      success: true,
      user: sessionUser(user),
    });
  } catch (error) {
    const fields = isRecord(error) ? error : {};
    // SEC-12: fixed messages only; the original error stays in the server log.
    if (fields.code === 11000) {
      const field = Object.keys(isRecord(fields.keyPattern) ? fields.keyPattern : {})[0];
      return res.status(422).json({
        success: false,
        message:
          field === "username"
            ? "Username is already taken"
            : "User already exists with this email",
      });
    }
    if (fields.name === "ValidationError") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid registration details." });
    }
    console.error("Register failed:", messageOf(error));
    return res.status(500).json({
      success: false,
      message:
        fields.statusCode === 500 && typeof fields.message === "string"
          ? fields.message
          : "Server error during registration",
    });
  }
};

export const loginUser: ApiHandler<ParamsDictionary, LoginBody> = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password +tokenVersion");

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({
        success: false,
        message: "Invalid Email or Password",
      });
    }

    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid Email or Password",
      });
    }

    setAuthCookie(res, user);

    return res.status(200).json({
      success: true,
      user: sessionUser(user),
    });
  } catch (error) {
    console.error("Login failed:", messageOf(error));
    return res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

export const logoutUser: ApiHandler = async (req, res) => {
  // SEC-09: revoke server-side, not just in this browser. Bumping tokenVersion
  // invalidates every token issued to this user so far (all devices). Logout
  // itself always succeeds, with or without a valid token.
  try {
    const token = tokenCookie(req);
    const user = token ? await userForToken(token) : null;
    if (user) {
      await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    }
  } catch {
    // Invalid, expired or already revoked token: nothing left to revoke.
  }

  clearAuthCookie(res);
  return res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
};

export const getUserProfile: ApiHandler = async (req, res) => {
  try {
    const user = await User.findById(currentUser(req)._id).populate({
      path: "bookings",
      populate: { path: "assignedStation", select: "stationId type" },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, user });
  } catch {
    return res
      .status(500)
      .json({ success: false, message: "Error fetching profile" });
  }
};

export const toggleWishlist: ApiHandler<ParamsDictionary, WishlistBody> = async (req, res) => {
  try {
    const { stationId } = req.body;

    if (!stationId) {
      return res
        .status(400)
        .json({ success: false, message: "Station ID is required" });
    }

    const user = await User.findById(currentUser(req)._id);
    // A deleted account: the same 500 that reading user.wishlist on null gave.
    if (!user) throw new Error("toggleWishlist: user not found");

    const isWishlisted = user.wishlist.includes(stationId);

    let message = "";
    if (isWishlisted) {
      user.wishlist.pull(stationId);
      message = `${stationId} removed from wishlist`;
    } else {
      user.wishlist.push(stationId);
      message = `${stationId} added to wishlist`;
    }

    await user.save();
    return res
      .status(200)
      .json({ success: true, message, wishlist: user.wishlist });
  } catch {
    return res
      .status(500)
      .json({ success: false, message: "Error updating wishlist" });
  }
};
