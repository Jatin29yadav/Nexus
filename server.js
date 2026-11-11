require("dotenv").config({ path: "./.env", quiet: true });

const { validateEnv } = require("./config/env");

try {
  validateEnv();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const mongoose = require("mongoose");
const app = require("./app");

const PORT = process.env.PORT || 3005;
let server;

// Connect first, then listen: if the database is unreachable the process
// exits non-zero instead of serving requests that can only time out.
async function start() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  server = app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
  });
}

// Render sends SIGTERM on every deploy/restart: stop accepting connections,
// let in-flight requests finish, close the database, then exit.
async function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error.message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

start().catch((error) => {
  // error.message only: the full error object can include the connection string.
  console.error("Startup failed:", error.message);
  process.exit(1);
});
