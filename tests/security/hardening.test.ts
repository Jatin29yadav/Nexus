// Baseline hardening that is not tied to a single AUDIT.md finding:
// health endpoint, body limits, the central error handler, and validation on
// the last two routes that took unvalidated input.
import mongoose from "mongoose";
import type { Request, Response } from "express";
import type { Test } from "supertest";
import { api, makeUser, makeAdmin, makeBooking, makeMessage, models, allSources } from "../setup/helpers";
import { errorHandler } from "../../src/utils/errorHandler";
import { ExpressError } from "../../src/utils/expressError";

describe("GET /health and /api/health", () => {
  it.each(["/health", "/api/health"])("%s answers 200 without auth while the database is up", async (url) => {
    const res = await api().get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: "ok" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers 503 when the database is not connected", async () => {
    const state = vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);
    try {
      const res = await api().get("/health");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ success: false, status: "unavailable" });
    } finally {
      state.mockRestore();
    }
  });

  it("is not rate limited", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await api().get("/health")).headers["ratelimit"]).toBeUndefined();
    }
  });
});

describe("request bodies", () => {
  it("a body over 50 kB is refused with 413", async () => {
    const res = await api()
      .post("/api/messages")
      .send({ name: "Big", email: "big@example.test", message: "x".repeat(60 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ success: false, message: "Request body is too large." });
    expect(await models.Message.countDocuments()).toBe(0);
  });

  it("malformed JSON is a 400 that does not echo the parser error", async () => {
    const res = await api()
      .post("/api/users/login")
      .set("Content-Type", "application/json")
      .send('{"email": "a@b.c", "password": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Malformed JSON body." });
  });

  it("a JSON body that is not an object is a 400", async () => {
    const res = await api()
      .post("/api/users/login")
      .set("Content-Type", "application/json")
      .send("[1,2,3]");
    expect(res.status).toBe(400);
  });
});

describe("central error handler", () => {
  const run = (err: unknown) => {
    const res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // Test doubles: the handler only touches these members.
    const req = { method: "GET", originalUrl: "/api/x" } as unknown as Request;
    errorHandler(err, req, res as unknown as Response, () => {});
    const logged = log.mock.calls.length;
    log.mockRestore();
    return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0], logged };
  };

  it.each(["production", "development", "test"])(
    "an unexpected error is a generic 500 with no message or stack (NODE_ENV=%s)",
    (env) => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = env;
      try {
        const err = new Error("connect ECONNREFUSED mongodb+srv://user:pw@cluster0.example");
        const { status, body, logged } = run(err);

        expect(status).toBe(500);
        expect(body).toEqual({ success: false, message: "Internal Server Error" });
        expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|cluster0|stack|at /);
        expect(logged).toBe(1); // the detail goes to the server log
      } finally {
        process.env.NODE_ENV = original;
      }
    },
  );

  it("our own 4xx errors keep their message and are not logged as failures", () => {
    const { status, body, logged } = run(new ExpressError(404, "API Endpoint Not Found!"));
    expect(status).toBe(404);
    expect(body).toEqual({ success: false, message: "API Endpoint Not Found!" });
    expect(logged).toBe(0);
  });

  it("a nonsense status code is treated as 500", () => {
    const err = Object.assign(new Error("boom"), { statusCode: 200 });
    expect(run(err).status).toBe(500);
  });

  it("an unknown route answers 404 in the standard envelope", async () => {
    const res = await api().get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "API Endpoint Not Found!" });
  });

  it("a failing controller answers 500 without leaking the cause", async () => {
    const find = vi.spyOn(models.Station, "find").mockImplementation(() => {
      throw new Error("MongoServerSelectionError: cluster0-shard-00-00 unreachable");
    });
    try {
      const res = await api().get("/api/stations");
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/cluster0|Mongo|stack/);
    } finally {
      find.mockRestore();
    }
  });
});

describe("validation on the remaining routes", () => {
  it.each([
    ["an invalid email", { email: "nope" }, "Invalid email format"],
    ["a 6000-character message", { message: "x".repeat(6000) }, "Message is too long"],
    ["a non-string subject", { subject: 42 }, "Subject must be text"],
  ])("POST /api/messages with %s is a 400", async (_label, overrides, message) => {
    const res = await api()
      .post("/api/messages")
      .send({ name: "Visitor", email: "v@example.test", message: "Hello there", ...overrides });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message });
    expect(await models.Message.countDocuments()).toBe(0);
  });

  it("POST /api/messages cannot set status or createdAt", async () => {
    await api().post("/api/messages").send({
      name: "Visitor",
      email: "v@example.test",
      message: "Hello there",
      status: "Read",
      createdAt: "2001-01-01T00:00:00.000Z",
    });
    const saved = (await models.Message.findOne().lean())!;
    expect(saved.status).toBe("Unread");
    expect(saved.createdAt.getFullYear()).not.toBe(2001);
  });

  it.each([[42], ["x".repeat(50)], ["<script>"]])("POST /api/users/wishlist rejects stationId %j", async (stationId) => {
    const { user, cookie } = await makeUser();
    const res = await api().post("/api/users/wishlist").set("Cookie", cookie).send({ stationId });

    expect(res.status).toBe(400);
    expect((await models.User.findById(user._id))!.wishlist).toEqual([]);
  });
});

describe("ownership on every per-resource route", () => {
  it("a user can only read, change or delete their own booking", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const booking = await makeBooking(owner);
    const url = `/api/bookings/${booking._id}`;
    const as = (req: Test) => req.set("Cookie", stranger.cookie);

    expect((await as(api().get(url))).status).toBe(403);
    expect((await as(api().put(url)).send({ phone: "9111111111" })).status).toBe(403);
    expect((await as(api().delete(url))).status).toBe(403);

    const untouched = (await models.Booking.findById(booking._id))!;
    expect(untouched.phone).toBe("9123456780");
  });

  it("the wishlist route only ever touches the caller's own document", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await api().post("/api/users/wishlist").set("Cookie", a.cookie).send({ stationId: "PC-01" });

    expect((await models.User.findById(a.user._id))!.wishlist).toEqual(["PC-01"]);
    expect((await models.User.findById(b.user._id))!.wishlist).toEqual([]);
  });

  it("messages are admin-only to read, mark and delete", async () => {
    const message = await makeMessage();
    const { cookie } = await makeUser();
    const admin = await makeAdmin();

    expect((await api().get("/api/messages").set("Cookie", cookie)).status).toBe(403);
    expect((await api().put(`/api/messages/${message._id}/read`).set("Cookie", cookie)).status).toBe(403);
    expect((await api().delete(`/api/messages/${message._id}`).set("Cookie", cookie)).status).toBe(403);
    expect((await api().get("/api/messages").set("Cookie", admin.cookie)).status).toBe(200);
  });
});

describe("no hard-coded hosts or secrets in the source", () => {
  const sources = allSources;

  it("no reference to the old Render service or a mongodb+srv URL", () => {
    for (const [file, text] of sources()) {
      expect([file, /onrender\.com|mongodb\+srv:\/\//.test(text)]).toEqual([file, false]);
    }
  });

  it("JWT_SECRET is only ever read from the environment", () => {
    for (const [file, text] of sources()) {
      expect([file, /JWT_SECRET\s*[:=]\s*["'`]/.test(text)]).toEqual([file, false]);
    }
  });
});
