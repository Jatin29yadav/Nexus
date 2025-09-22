const Booking = require("../models/Booking");

module.exports.renderBookingFrom = (req, res) => {
  res.render("booking/booking.ejs");
};

module.exports.booking = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      membersCount,
      membersName,
      bookingType,
      bookingTime,
    } = req.body;

    const memberList = membersName
      ? membersName
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean)
      : [];

    const booking = new Booking({
      name,
      email,
      phone,
      membersCount,
      membersName: memberList,
      bookingType,
      bookingTime: {
        start: bookingTime.start,
        end: bookingTime.end,
      },
    });

    await booking.save();
    req.flash(
      "success",
      "Your Booking is Received , you will be notified soon ..."
    );
    res.redirect("/bookings");
  } catch (error) {
    console.error(error);
    req.flash("error", "Something went wrong");
    res.redirect("/booking");
  }
};

module.exports.bookingsList = async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.render("booking/bookingList.ejs", { bookings });
  } catch (err) {
    console.error(err);
    req.flash("error", "Error fetching bookings");
    res.redirect("/");
  }
};
