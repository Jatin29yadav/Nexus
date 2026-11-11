// Starts ONE in-memory MongoDB for the whole run. Tests never touch a real DB.
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod;

export async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.TEST_MONGO_URI = mongod.getUri();
}

export async function teardown() {
  if (mongod) await mongod.stop();
}
