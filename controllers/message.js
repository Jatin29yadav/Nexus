const Message = require("../models/Message.js");

module.exports.renderContactForm = (req, res) => {
  res.render("pages/contact.ejs");
};

module.exports.contactMessage = async (req, res) => {
  try {
    let { name, email, message } = req.body;
    let newMessage = new Message({ name, email, message });
    await newMessage.save();

    req.flash("success", "Your message sent successfuly");
    res.redirect("/");
  } catch (err) {
    req.flash("error", "Something went wrong , please try later !");
    console.log(err);
    res.redirect("/contact");
  }
};
