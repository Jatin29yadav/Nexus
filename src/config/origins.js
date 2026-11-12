// The browser origins allowed to call this API with credentials.
// Used by CORS and by the CSRF origin check, so the two can never disagree.
//
// FRONTEND_URL: one origin or a comma-separated list, e.g.
//   https://nexus.example.com,https://nexus-preview.example.com
// CLIENT_URL is the old name and is still read when FRONTEND_URL is unset.
// The Vite dev server is allowed only outside production (SEC-14).
const DEV_ORIGIN = "http://localhost:5173";

function parseOrigins(env = process.env) {
  const configured = (env.FRONTEND_URL || env.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  const origins = env.NODE_ENV === "production" ? configured : [...configured, DEV_ORIGIN];
  return [...new Set(origins)];
}

module.exports = { allowedOrigins: parseOrigins(), parseOrigins };
