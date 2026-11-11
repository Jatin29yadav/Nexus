const { verifyAuthToken } = require("./utils/authToken");
const User = require("./models/User");

module.exports.isLoggedIn = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided." });
    }

    const decoded = verifyAuthToken(token);

    req.user = await User.findById(decoded.userId).select("-password");

    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found in database." });
    }

    next();
  } catch (error) {
    console.error("Auth Error:", error.message);
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token." });
  }
};

// For public routes whose response depends on who is asking. Never rejects:
// a missing, invalid or expired cookie simply means "anonymous".
module.exports.optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (token) {
      const decoded = verifyAuthToken(token);
      req.user = await User.findById(decoded.userId).select("-password");
    }
  } catch (error) {
    req.user = null;
  }
  next();
};

module.exports.isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "Admin") {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: "Unauthorized. Admin Access Required.",
    });
  }
};
