// Creates the cafe's stations (50 PCs, 10 consoles) if they do not exist yet.
// Idempotent and non-destructive: existing stations, and their live status,
// are left untouched (SEC-15). Refuses NODE_ENV=production (see init/guard.ts).
// Run from the Nexus/ folder: npx tsx src/seedStations.ts
// (or node dist/seedStations.js after npm run build).
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Station } from "./models/Station";
import { assertSafeToSeed } from "./init/guard";
import { messageOf } from "./utils/narrow";
import type { IStation } from "./types/domain";

dotenv.config({ quiet: true });

const pad = (n: number): string => String(n).padStart(2, "0");

const seedDB = async (): Promise<void> => {
  assertSafeToSeed("seedStations.ts"); // checks NODE_ENV / MONGO_URI

  // assertSafeToSeed has checked that MONGO_URI is set.
  await mongoose.connect(process.env.MONGO_URI ?? "");
  console.log("DB Connected for Seeding");

  const stations: Array<Pick<IStation, "stationId" | "type">> = [
    ...Array.from({ length: 50 }, (_, i) => ({ stationId: `PC-${pad(i + 1)}`, type: "PC" as const })),
    ...Array.from({ length: 10 }, (_, i) => ({ stationId: `C-${pad(i + 1)}`, type: "Console" as const })),
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
  .catch((err: unknown) => {
    console.error(messageOf(err));
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
