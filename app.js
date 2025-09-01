const express = require("express");
const app = express();
const methodOverride = require("method-override");
const path = require("path");
const mongoose = require("mongoose");
const User = require("./models/User.js");
let port = 3006;

app.use(methodOverride("_method"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/views"));
app.use(express.static(path.join(__dirname, "public")));

mongoose
  .connect("mongodb://127.0.0.1:27017/Nexus", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB connected successfully");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:");
  });

app.listen(port, () => {
  console.log(`Connected to port : ${port}`);
});

app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

// Register
app.post("/register", async (req, res) => {
  try {
    let { username, email, password, confirmPassword, phone } = req.body;

    if (password !== confirmPassword) {
      return res.redirect("/register?error=password");
    }

    let newUser = new User({ username, email, password, phone });
    await newUser.save();

    return res.redirect("/register?success=registered");
  } catch (err) {
    console.error(err);
    return res.redirect("/register?error=server");
  }
});

// Login (example, adjust with real check)
app.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    let user = await User.findOne({ email });

    if (!user || user.password !== password) {
      return res.redirect("/login?error=invalid");
    }

    return res.redirect("/login");
  } catch (err) {
    console.error(err);
    return res.redirect("/login?error=server");
  }
});
