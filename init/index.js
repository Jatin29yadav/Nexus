const mongoose = require("mongoose");
const { data } = require("./data.js");
const User = require("../models/User.js");

main()
  .then(() => {
    console.log("connected");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017/Nexus");
}

const initDB = async () => {
  await User.deleteMany({});
  await User.insertMany(data);
  console.log("Data was initialized");
};

initDB();
