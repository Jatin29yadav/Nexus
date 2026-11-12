// Side effect only: loads ./.env (relative to the working directory) into
// process.env. server.ts imports this first, so every module after it sees
// the values, exactly as the old require("dotenv").config() at the top did.
import dotenv from "dotenv";

dotenv.config({ path: "./.env", quiet: true });
