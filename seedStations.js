require("dotenv").config();
const mongoose = require("mongoose");
const Station = require("./models/Station");

const dbUrl = process.env.MONGO_URI;

mongoose
  .connect(dbUrl)
  .then(() => console.log("DB Connected for Seeding"))
  .catch((err) => console.log(err));

const seedDB = async () => {
  await Station.deleteMany({}); // Pehle ka kachra saaf karega

  const stations = [];

  // 50 PCs generate karo
  for (let i = 1; i <= 50; i++) {
    const id = i < 10 ? `PC-0${i}` : `PC-${i}`; // 01, 02... format
    stations.push({ stationId: id, type: "PC", status: "Available" });
  }

  // 10 Consoles generate karo
  for (let i = 1; i <= 10; i++) {
    const id = i < 10 ? `C-0${i}` : `C-${i}`;
    stations.push({ stationId: id, type: "Console", status: "Available" });
  }

  await Station.insertMany(stations);
  console.log("🔥 Successfully planted 50 PCs and 10 Consoles in Database!");
  mongoose.connection.close();
};

seedDB();
