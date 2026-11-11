// The browser origins allowed to call this API with credentials.
// Used by CORS and by the CSRF origin check, so the two can never disagree.
const allowedOrigins = [process.env.CLIENT_URL, "http://localhost:5173"].filter(Boolean);

module.exports = { allowedOrigins };
