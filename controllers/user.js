const User = require("../models/User");
const jwt = require("jsonwebtoken");

module.exports.registerUser = async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    const isExist = await User.findOne({ email });

    if (isExist) {
      return res.status(422).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    const user = await User.create({ email, username, phone, password });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });

    return res.status(201).json({
      success: true,
      user: { _id: user._id, email: user.email, username: user.username },
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
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

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });

    return res.status(200).json({
      success: true,
      user: { _id: user._id, email: user.email, username: user.username },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

module.exports.logoutUser = (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    expires: new Date(0),
  });
  return res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
};

module.exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: "bookings",
      populate: { path: "assignedStation", select: "stationId type" },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error fetching profile" });
  }
};

module.exports.toggleWishlist = async (req, res) => {
  try {
    const { stationId } = req.body;

    if (!stationId) {
      return res
        .status(400)
        .json({ success: false, message: "Station ID is required" });
    }

    const user = await User.findById(req.user._id);

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
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error updating wishlist" });
  }
};
