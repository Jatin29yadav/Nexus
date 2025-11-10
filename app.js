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
const ExpressError = require("./utils/ExpressError.js");

let port = 3005;

// Connect to MongoDB first
async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017/Nexus");
  console.log("connected");
}
main().catch((err) => console.log(err));

// Session setup
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

// Middleware order — important
app.use(express.json()); // <-- must be before routes
app.use(express.urlencoded({ extended: true })); // <-- must be before routes
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(expressLayouts);
app.set("layout", "layouts/boilerplate");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/views"));
app.use(session(sessionOptions));
app.use(flash());

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Flash & current user available globally in EJS
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

// Route Imports
const userRouter = require("./routes/user.js");
const bookingRouter = require("./routes/booking.js");
const messageRouter = require("./routes/message.js");
const tournamentRouter = require("./routes/tournament.js");
const apiBookingRouter = require("./routes/apiBooking.js");

// Route Setup
app.get("/", (req, res) => {
  res.render("pages/index.ejs");
});

app.use("/", userRouter);
app.use("/", bookingRouter);
app.use("/contact", messageRouter);
app.use("/tournament", tournamentRouter);
app.use("/api/bookings", apiBookingRouter); // <-- API endpoint (POST /api/bookings)

app.get("/payment", (req, res) => {
  res.render("pages/payment.ejs");
});

app.get("/gallery", (req, res) => {
  res.render("pages/gallery.ejs");
});

// 404 handler
app.use((req, res, next) => {
  next(new ExpressError(404, "Page not found"));
});

// Global error handler
app.use((err, req, res, next) => {
  const { statusCode = 500 } = err;
  if (req.originalUrl.startsWith("/api/")) {
    // API error response
    return res.status(statusCode).json({
      success: false,
      flashType: "error",
      message: err.message || "Something went wrong",
    });
  }
  // Render normal error page
  res.status(statusCode).render("includes/error.ejs", { err });
});

// Start server
app.listen(port, () => {
  console.log(`Connected to port : ${port}`);
});
