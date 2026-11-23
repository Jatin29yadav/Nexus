import "./config/loadEnv"; // must stay the first import
import { createServer, type Server } from "node:http";
import mongoose from "mongoose";
import { validateEnv, type Config } from "./config/env";
import { app } from "./app";
import { createRealtime, closeRealtime, type ChatServer } from "./realtime";
import { messageOf } from "./utils/narrow";

let config: Config;
try {
  config = validateEnv();
} catch (error) {
  console.error(messageOf(error));
  process.exit(1);
}

const PORT = config.PORT || 3005;
let server: Server | undefined;
let io: ChatServer | undefined;

// Connect first, then listen: if the database is unreachable the process
// exits non-zero instead of serving requests that can only time out.
async function start(): Promise<void> {
  await mongoose.connect(config.MONGO_URI);
  console.log("Connected to MongoDB.");

  // Express and Socket.IO (live chat, /socket.io/) share one HTTP server.
  server = createServer(app);
  io = createRealtime(server);
  server.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
  });
}

// Render sends SIGTERM on every deploy/restart: stop accepting connections,
// let in-flight requests finish, close the database, then exit.
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`${signal} received, shutting down.`);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  try {
    // Disconnects chat sockets, then closes the HTTP server.
    if (io) await closeRealtime(io);
    else if (server) {
      const running = server;
      await new Promise((resolve) => running.close(resolve));
    }
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", messageOf(error));
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

start().catch((error: unknown) => {
  // error.message only: the full error object can include the connection string.
  console.error("Startup failed:", messageOf(error));
  process.exit(1);
});
