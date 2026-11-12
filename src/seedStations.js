// Creates the cafe's stations (50 PCs, 10 consoles) if they do not exist yet.
// Idempotent and non-destructive: existing stations, and their live status,
// are left untouched (SEC-15). Run from the Nexus/ folder: node seedStations.js
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const Station = require("./models/Station");
const { assertSafeToSeed } = require("./init/guard");

const pad = (n) => String(n).padStart(2, "0");

const seedDB = async () => {
  assertSafeToSeed("seedStations.js"); // checks NODE_ENV / MONGO_URI

  await mongoose.connect(process.env.MONGO_URI);
  console.log("DB Connected for Seeding");

  const stations = [
    ...Array.from({ length: 50 }, (_, i) => ({ stationId: `PC-${pad(i + 1)}`, type: "PC" })),
    ...Array.from({ length: 10 }, (_, i) => ({ stationId: `C-${pad(i + 1)}`, type: "Console" })),
  ];

  const result = await Station.bulkWrite(
    stations.map((station) => ({
      updateOne: {
        filter: { stationId: station.stationId },
        update: { $setOnInsert: { ...station, status: "Available" } },
        upsert: true,
      },
    })),
  );

  console.log(
    `Stations ready: ${result.upsertedCount} created, ${stations.length - result.upsertedCount} already present.`,
  );
};

seedDB()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
