const Message = require("../models/Message.js");
const express = require("express");
const Booking = require("../models/Booking");
const router = express.Router();

router.get("/contact", (req, res) => {
  res.render("pages/contact.ejs");
});

router.post("/contact", async (req, res) => {
  try {
    let { name, email, message } = req.body;
    let newMessage = new Message({ name, email, message });
    await newMessage.save();

    res.redirect("/contact");
  } catch (err) {
    console.log("ERROR :", err);
    res.redirect("/contact");
  }
});

router.get("/booking", (req, res) => {
  res.render("booking/booking.ejs");
});

router.post("/booking", async (req, res) => {
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
    res.send(`
      <script>
        alert("✅ Booking Successful!");
        window.location.href = "/"; // redirect back to booking page
      </script>
    `);
  } catch (error) {
    console.error(error);
    res.send(`
      <script>
        alert("❌ Error saving booking: ${error.message}");
        window.location.href = "/booking"; // stay on booking page
      </script>
    `);
  }
});

router.get("/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.render("booking/bookingList.ejs", { bookings });
  } catch (err) {
    console.error(err);
    res.send("Error fetching bookings");
  }
});

module.exports = router;
