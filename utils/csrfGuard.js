// SEC-05: the auth cookie is sent by the browser automatically, so a
// state-changing request must prove it comes from our own frontend.
//
// 1. Browsers attach `Origin` to every cross-site POST/PUT/DELETE. If it is
//    present it must be on the allow-list. (Non-browser clients send none and
//    cannot be used for CSRF, since they have no victim cookie.)
// 2. A body must be JSON. HTML forms can only send urlencoded, multipart or
//    text/plain without a CORS preflight, so this closes the form vector too.
const { allowedOrigins } = require("../config/origins");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

module.exports = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ success: false, message: "Origin not allowed." });
  }

  // Body-less requests (e.g. PUT /messages/:id/read) carry no content type.
  const hasBody =
    req.headers["transfer-encoding"] !== undefined || Number(req.headers["content-length"]) > 0;
  if (hasBody && !req.is("application/json")) {
    return res
      .status(415)
      .json({ success: false, message: "Content-Type must be application/json." });
  }

  next();
};
