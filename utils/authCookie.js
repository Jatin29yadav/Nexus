// SEC-13: one definition of the auth cookie, used by login, register and logout.
const { signAuthToken, TOKEN_TTL_SECONDS } = require("./authToken");

const COOKIE_NAME = "token";
const SAME_SITE_VALUES = ["lax", "strict", "none"];

// SameSite:
//   production  → "none" (frontend on Vercel and API on Render are different
//                 sites today). Set COOKIE_SAMESITE=lax once the frontend
//                 reaches the API through the Vercel /api rewrite (DEP-04).
//   elsewhere   → "lax" (localhost:5173 → localhost:3005 is same-site).
// Secure: always in production, and whenever SameSite=None, because browsers
// reject SameSite=None cookies that are not Secure.
const cookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const requested = (process.env.COOKIE_SAMESITE || "").toLowerCase();
  const sameSite = SAME_SITE_VALUES.includes(requested)
    ? requested
    : isProduction
      ? "none"
      : "lax";

  return {
    httpOnly: true,
    secure: isProduction || sameSite === "none",
    sameSite,
    path: "/",
  };
};

// The cookie lives exactly as long as the JWT inside it.
const setAuthCookie = (res, userId) => {
  res.cookie(COOKIE_NAME, signAuthToken(userId), {
    ...cookieOptions(),
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
};

// Same attributes as when it was set, otherwise browsers keep the old cookie.
const clearAuthCookie = (res) => {
  res.cookie(COOKIE_NAME, "", { ...cookieOptions(), expires: new Date(0) });
};

module.exports = { setAuthCookie, clearAuthCookie, cookieOptions, COOKIE_NAME };
