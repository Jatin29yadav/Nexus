const Tournament = require("./models/Tournament");
const Booking = require("./models/Booking");
const Message = require("./models/Message");

module.exports.saveRediredtUrl = (req, res, next) => {
  if (req.session.redirectUrl) {
    res.locals.redirectUrl = req.session.redirectUrl;
  }
  next();
};
