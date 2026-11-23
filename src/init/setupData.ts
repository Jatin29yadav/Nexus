// init/setupData.ts
import mongoose from "mongoose";
import { Setup } from "../models/Setup";
import type { ISetup } from "../types/domain";

// Legacy script (the Setup model is unused). Guarded like the other seeds.
if (process.env.NODE_ENV === "production") {
  throw new Error("init/setupData.ts: refusing to run with NODE_ENV=production.");
}

const setupData: Array<Pick<ISetup, "name" | "type" | "isActive">> = [
  { name: "PC-1", type: "PC", isActive: true },
  { name: "PC-2", type: "PC", isActive: true },
  { name: "PC-3", type: "PC", isActive: true },
  { name: "VR-1", type: "VR", isActive: true },
  { name: "VR-2", type: "VR", isActive: true },
];

async function initSetupDB(): Promise<void> {
  await mongoose.connect("mongodb://127.0.0.1:27017/Nexus");
  console.log("Connected to DB ✅");

  await Setup.deleteMany({});
  await Setup.insertMany(setupData);
  console.log("🎮 Setup data inserted successfully!");

  mongoose.connection.close();
}

initSetupDB().catch((err: unknown) =>
  console.error("Error initializing setup data:", err)
);
