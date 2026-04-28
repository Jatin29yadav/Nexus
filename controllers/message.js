const Message = require("../models/Message.js");

module.exports.contactMessage = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Please fill all the required fields.",
      });
    }

    const newMessage = new Message({ name, email, phone, subject, message });
    await newMessage.save();

    return res.status(201).json({
      success: true,
      message: "Transmission sent successfully!",
    });
  } catch (err) {
    console.error("Contact Form Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong, please try again later!",
    });
  }
};

module.exports.getAllMessages = async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, messages });
  } catch (err) {
    console.error("Fetch Messages Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching messages" });
  }
};

module.exports.markMessageRead = async (req, res) => {
  try {
    const msg = await Message.findByIdAndUpdate(
      req.params.id,
      { status: "Read" },
      { new: true },
    );

    if (!msg)
      return res
        .status(404)
        .json({ success: false, message: "Transmission not found" });

    return res
      .status(200)
      .json({ success: true, message: "Marked as Read", data: msg });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error updating status" });
  }
};

module.exports.deleteMessage = async (req, res) => {
  try {
    const msg = await Message.findByIdAndDelete(req.params.id);

    if (!msg)
      return res
        .status(404)
        .json({ success: false, message: "Transmission not found" });

    return res
      .status(200)
      .json({ success: true, message: "Transmission deleted" });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error deleting transmission" });
  }
};
