// The one place an unhandled error becomes a response.
// Clients only ever get { success: false, message } with a fixed, safe message:
// never a stack trace, a driver error or a parser message, in any environment.
// The full error goes to the server log for 5xx.
const ExpressError = require("./expressError");

// eslint-disable-next-line no-unused-vars -- Express needs the 4-argument signature
module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = err.statusCode || err.status || 500;
  if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;

  let message;
  if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Malformed JSON body.";
  } else if (err.type === "entity.too.large") {
    status = 413;
    message = "Request body is too large.";
  } else if (err instanceof ExpressError && status < 500) {
    message = err.message; // written by us, safe to show
  } else if (status >= 500) {
    message = "Internal Server Error";
  } else {
    message = "Bad request.";
  }

  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  res.status(status).json({ success: false, message });
};
