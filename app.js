const express = require("express");
const app = express();

const cors = require("cors");
const cookieParser = require("cookie-parser");
const ExpressError = require("./utils/expressError.js");

const userRouter = require("./routes/user.js");
const messageRoutes = require("./routes/message.js");
const tournamentRouter = require("./routes/tournament.js");
const bookingRouter = require("./routes/booking.js");
const adminRouter = require("./routes/admin.js");
const stationRouter = require("./routes/station.js");

app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:5173"],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/users", userRouter);
app.use("/api/tournaments", tournamentRouter);
app.use("/api/messages", messageRoutes);
app.use("/api/bookings", bookingRouter);
app.use("/api/admin", adminRouter);
app.use("/api/stations", stationRouter);

app.use((req, res, next) => {
  next(new ExpressError(404, "API Endpoint Not Found!"));
});

app.use((err, req, res, next) => {
  const { statusCode = 500 } = err;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;
