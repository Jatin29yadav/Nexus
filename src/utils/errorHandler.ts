// The one place an unhandled error becomes a response.
// Clients only ever get { success: false, message } with a fixed, safe message:
// never a stack trace, a driver error or a parser message, in any environment.
// The full error goes to the server log for 5xx.
import type { ErrorRequestHandler } from "express";
import { ExpressError } from "./expressError";
import { isRecord } from "./narrow";

// Express needs the 4-argument signature to treat this as an error handler.
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) return next(err);

  const fields = isRecord(err) ? err : {};
  const status = fields.statusCode || fields.status || 500;
  let code =
    typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
      ? status
      : 500;

  let message: string;
  if (fields.type === "entity.parse.failed") {
    code = 400;
    message = "Malformed JSON body.";
  } else if (fields.type === "entity.too.large") {
    code = 413;
    message = "Request body is too large.";
  } else if (err instanceof ExpressError && code < 500) {
    message = err.message; // written by us, safe to show
  } else if (code >= 500) {
    message = "Internal Server Error";
  } else {
    message = "Bad request.";
  }

  if (code >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  res.status(code).json({ success: false, message });
};
