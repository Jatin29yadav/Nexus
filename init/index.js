require("dotenv").config({ path: "../.env" }); // .env file folder ke bahar hai, isliye ../ lagaya
const mongoose = require("mongoose");
const { data } = require("./data.js"); // Make sure data.js wahin rakhi ho
const User = require("../models/User.js");

// .env se Atlas ka link uthana
const DB_URL = process.env.MONGO_URI;

async function main() {
  await mongoose.connect(DB_URL);
}

main()
  .then(() => {
    console.log("🚀 Connected to MongoDB Atlas Cloud!");
    initDB(); // DB connect hone ke baad hi data daalna shuru karo
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
  });

const initDB = async () => {
  try {
    // 1. Pehle purana kachra saaf karo (Reset)
    await User.deleteMany({});
    console.log("🧹 Purana data saaf kar diya.");

    // 2. Naya data ek-ek karke insert karo (Taaki password hash ho sake!)
    for (const userData of data) {
      // .create() chalane se tumhara pre('save') hook automatically trigger hoga
      await User.create(userData);
    }

    console.log("✅ Users properly planted with HASHED passwords!");
  } catch (error) {
    console.error("❌ Error inserting data:", error);
  } finally {
    // 3. Script khatam hone ke baad connection close kar do
    mongoose.connection.close();
  }
};
