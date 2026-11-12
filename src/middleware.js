const { verifyAuthToken } = require("./utils/authToken");
const { User } = require("./models/User");

// Resolves a token to its user, or null when the user no longer exists.
// Throws when the token is invalid, expired, or revoked: a token is only good
// while its `tv` equals the user's current tokenVersion (SEC-09). Tokens
// issued before tokenVersion existed carry no `tv` and count as version 0.
const userForToken = async (token) => {
  const decoded = verifyAuthToken(token);
  const user = await User.findById(decoded.userId).select("-password +tokenVersion");
  if (user && (decoded.tv || 0) !== (user.tokenVersion || 0)) {
    throw new Error("token revoked");
  }
  return user;
};
module.exports.userForToken = userForToken;

module.exports.isLoggedIn = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided." });
    }

    req.user = await userForToken(token);

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
      req.user = await userForToken(token);
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
