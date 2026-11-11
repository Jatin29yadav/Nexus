import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.js"],
    globalSetup: ["./tests/setup/global-setup.mjs"],
    setupFiles: ["./tests/setup/setup.js"],
    // One in-memory MongoDB is shared; files run one at a time so they cannot
    // see each other's data.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 180000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "app.js",
        "middleware.js",
        "controllers/**/*.js",
        "routes/**/*.js",
        "models/**/*.js",
        "services/**/*.js",
        "utils/**/*.js",
        "validations/**/*.js",
      ],
      // server.js and the seed scripts connect to MONGO_URI from .env and must
      // never be loaded by tests.
      exclude: ["server.js", "seedStations.js", "init/**"],
    },
  },
});
