const express = require("express");
const app = express();
const methodOverride = require("method-override");
const path = require("path");
const mongoose = require("mongoose");
const expressLayouts = require("express-ejs-layouts");
const flash = require("connect-flash");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/User.js");
const Message = require("./models/Message.js");
const Tournament = require("./models/Tournament");
const Booking = require("./models/Booking");

let port = 3006;

const sessionOptions = {
  secret: "mysecretsessioncode",
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

app.use(expressLayouts);
app.set("layout", "layouts/boilerplate");
app.use(methodOverride("_method"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/views"));
app.use(express.static(path.join(__dirname, "public")));

main()
  .then(() => {
    console.log("connected");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017/Nexus");
}

app.listen(port, () => {
  console.log(`Connected to port : ${port}`);
});

app.get("/", (req, res) => {
  res.render("pages/index.ejs");
});

app.post("/register", async (req, res) => {
  try {
    let { username, email, password, confirmPassword, phone } = req.body;

    if (password !== confirmPassword) {
      return res.redirect("/register?error=password");
    }

    let newUser = new User({ username, email, password, phone });
    await newUser.save();

    return res.redirect("/?success=registered");
  } catch (err) {
    console.error(err);
    return res.redirect("/");
  }
});

app.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    let user = await User.findOne({ email });

    if (!user || user.password !== password) {
      return res.redirect("/login?error=invalid");
    }

    return res.redirect("/");
  } catch (err) {
    console.error(err);
    return res.redirect("/login?error=server");
  }
});

app.get("/contact", (req, res) => {
  res.render("pages/contact.ejs");
});

app.post("/contact", async (req, res) => {
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

app.get("/payment", (req, res) => {
  res.render("pages/payment.ejs");
});

app.get("/gallery", (req, res) => {
  res.render("gallery.ejs");
});

app.get("/tournament", (req, res) => {
  res.render("tournament/tournament.ejs");
});

app.post("/tournament", async (req, res) => {
  try {
    const { teamName, captainName, captainEmail, captainPhone, members } =
      req.body;
    const memberArray = members ? members.split(",").map((m) => m.trim()) : [];

    const newTournament = new Tournament({
      teamName,
      captainName,
      captainEmail,
      captainPhone,
      members: memberArray,
    });

    await newTournament.save();
    res.redirect("/tournament?success=true");
  } catch (err) {
    console.error("Tournament registration error:", err);
    res.redirect("/tournament?success=false");
  }
});

app.get("/tournament/list", async (req, res) => {
  try {
    const teams = await Tournament.find();
    res.render("tournament/tournamentList.ejs", { teams });
  } catch (err) {
    console.error("Error fetching teams:", err);
    res.redirect("/tournament?success=false");
  }
});

app.get("/booking", (req, res) => {
  res.render("booking");
});

app.post("/booking", async (req, res) => {
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

app.get("/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.render("bookingList.ejs", { bookings });
  } catch (err) {
    console.error(err);
    res.send("Error fetching bookings");
  }
});

//page not found
app.use((req, res, next) => {
  next(new ExpressError(404, "Page not found"));
});

// Global error handler
app.use((err, req, res, next) => {
  const { statusCode = 500, message = "Something went wrong" } = err;
  res.status(statusCode).render("includes/error.ejs", { err });
});

// error handling
app.use((err, req, res, next) => {
  let { statusCode, message } = err;
  res.status(statusCode).send(message);
});
