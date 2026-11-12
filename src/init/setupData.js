// init/setupData.js
const mongoose = require("mongoose");
const { Setup } = require("../models/Setup");

// Legacy script (the Setup model is unused). Guarded like the other seeds.
if (process.env.NODE_ENV === "production") {
  throw new Error("init/setupData.js: refusing to run with NODE_ENV=production.");
}

const setupData = [
  { name: "PC-1", type: "PC", isActive: true },
  { name: "PC-2", type: "PC", isActive: true },
  { name: "PC-3", type: "PC", isActive: true },
  { name: "VR-1", type: "VR", isActive: true },
  { name: "VR-2", type: "VR", isActive: true },
];

async function initSetupDB() {
  await mongoose.connect("mongodb://127.0.0.1:27017/Nexus");
  console.log("Connected to DB ✅");

  await Setup.deleteMany({});
  await Setup.insertMany(setupData);
  console.log("🎮 Setup data inserted successfully!");

  mongoose.connection.close();
}

initSetupDB().catch((err) =>
  console.error("Error initializing setup data:", err)
);
