// Plants the sample users from data.ts. LOCAL DEVELOPMENT ONLY.
// DESTRUCTIVE: deletes every user in the database MONGO_URI points at.
// Run from the Nexus/ folder: npx tsx src/init/index.ts
// (or node dist/init/index.js after npm run build).
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { data } from "./data";
import { User } from "../models/User";
import { assertSafeToSeed } from "./guard";
import { messageOf } from "../utils/narrow";

// The repo's .env: two levels up from src/init/ and from dist/init/ alike.
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const initDB = async (): Promise<void> => {
  assertSafeToSeed("init/index.ts"); // refuses when NODE_ENV=production

  // No password is stored in the repo. Use SEED_USER_PASSWORD if provided,
  // otherwise generate a random one for this run and show it once.
  const generated = !process.env.SEED_USER_PASSWORD;
  const password = process.env.SEED_USER_PASSWORD || crypto.randomBytes(12).toString("base64url");

  // assertSafeToSeed has checked that MONGO_URI is set.
  await mongoose.connect(process.env.MONGO_URI ?? "");
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
  .catch((error: unknown) => {
    console.error(messageOf(error));
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
