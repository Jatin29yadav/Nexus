// Plants the sample users from data.js. LOCAL DEVELOPMENT ONLY.
// DESTRUCTIVE: deletes every user in the database MONGO_URI points at.
// Run from the Nexus/ folder: node init/index.js
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env"), quiet: true });
const mongoose = require("mongoose");
const { data } = require("./data.js");
const User = require("../models/User.js");
const { assertSafeToSeed } = require("./guard.js");

const initDB = async () => {
  assertSafeToSeed("init/index.js"); // refuses when NODE_ENV=production

  // No password is stored in the repo. Use SEED_USER_PASSWORD if provided,
  // otherwise generate a random one for this run and show it once.
  const generated = !process.env.SEED_USER_PASSWORD;
  const password = process.env.SEED_USER_PASSWORD || crypto.randomBytes(12).toString("base64url");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  await User.deleteMany({});
  for (const userData of data) {
    // .create() runs the pre("save") hook, so the password is hashed.
    await User.create({ ...userData, password });
  }

  console.log(`Planted ${data.length} sample users.`);
  if (generated) console.log(`Password for all sample users (this run only): ${password}`);
};

initDB()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
