const express = require("express");
const router = express.Router();
const User = require("../models/User.js");

router.get("/register", (req, res) => {
  res.render("user/register.ejs");
});

router.get("/login", (req, res) => {
  res.render("user/login.ejs");
});

router.post("/register", async (req, res) => {
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

router.post("/login", async (req, res) => {
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

module.exports = router;
