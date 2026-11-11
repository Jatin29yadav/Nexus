// Mongo sanitisation, first line of defence (SEC-04): refuse any JSON body
// that contains a key starting with "$" or containing ".", at any depth.
// Legitimate clients never send such keys; MongoDB treats them as operators
// or paths. Zod validation and mongoose's sanitizeFilter are the next lines.
const hasOperatorKey = (value, depth = 0) => {
  if (value === null || typeof value !== "object") return false;
  if (depth > 10) return true; // absurd nesting: refuse rather than walk it
  if (Array.isArray(value)) return value.some((v) => hasOperatorKey(v, depth + 1));
  return Object.keys(value).some(
    (key) => key.startsWith("$") || key.includes(".") || hasOperatorKey(value[key], depth + 1),
  );
};

module.exports = (req, res, next) => {
  if (hasOperatorKey(req.body)) {
    return res.status(400).json({ success: false, message: "Invalid request." });
  }
  next();
};
