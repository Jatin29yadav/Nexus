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
const Tournament = require("./models/Tournament");

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

const userRouter = require("./routes/user.js");
const bookingRouter = require("./routes/booking.js");

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

app.use("/", userRouter);
app.use("/", bookingRouter);

app.get("/payment", (req, res) => {
  res.render("pages/payment.ejs");
});

app.get("/gallery", (req, res) => {
  res.render("pages/gallery.ejs");
});

app.get("/tournament", (req, res) => {
  res.render("tournament/tournament.ejs");
});

app.post("/tournament", async (req, res) => {
  try {
    const { teamName, captainName, captainEmail, captainPhone, members } =
      req.body;
    const newTournament = new Tournament({
      teamName,
      captainName,
      captainEmail,
      captainPhone,
      members,
    });

    await newTournament.save();
    res.redirect("/tournament/list");
  } catch (err) {
    console.error("Tournament registration error:", err);
    res.redirect("/tournament");
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
