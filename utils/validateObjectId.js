// SEC-21: router.param() callback. A route id that is not a 24-character hex
// ObjectId is a client error (400), not a CastError surfacing as a 500.
const OBJECT_ID = /^[a-f0-9]{24}$/i;

module.exports = (req, res, next, value) => {
  if (!OBJECT_ID.test(value)) {
    return res.status(400).json({ success: false, message: "Invalid id." });
  }
  next();
};
