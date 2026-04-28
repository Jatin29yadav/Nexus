require("dotenv").config({ path: "./.env" });

const mongoose = require("mongoose");
const app = require("./app");

const PORT = process.env.PORT || 3005;
const DB_URL = process.env.MONGO_URI;

async function main() {
  await mongoose.connect(DB_URL);
  console.log("Connected to MongoDB Atlas Cloud!");
}

main().catch((err) => {
  console.error("MongoDB Connection Error:", err);
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
