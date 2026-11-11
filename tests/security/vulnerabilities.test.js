// One test (or more) per SEC finding in docs/AUDIT.md.
//
// Each `vuln(...)` test asserts the SECURE behaviour and is EXPECTED TO FAIL
// today (it.fails), which is what proves the finding. When Phase 3 fixes a
// finding, change that `vuln(` to `it(`.
//   SEC_STRICT=1 npm test   → shows the real assertion failures.
//
// SEC-14 lives in cors-production.test.js (needs NODE_ENV=production at load).
// SEC-19 and SEC-20 are frontend findings, tested in nexus-frontend.
const fs = require("fs");
const path = require("path");
const {
  api,
  makeUser,
  makeAdmin,
  makeBooking,
  makeTournament,
  seedStations,
  bookingPayload,
  players,
  vuln,
  models,
  PASSWORD,
} = require("../setup/helpers");

const ROOT = path.resolve(__dirname, "../..");
const installed = (name) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", name, "package.json"), "utf8")).version;
const atLeast = (version, minimum) => {
  const a = version.split(".").map(Number);
  const b = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

describe("SEC-01 booking list is scoped to the caller", () => {
  it("a normal user only receives their own bookings", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    await makeBooking(alice, { name: "Alice", phone: "9111111111" });
    await makeBooking(bob, { name: "Bob", phone: "9222222222" });

    const res = await api().get("/api/bookings").set("Cookie", alice.cookie);

    expect(res.status).toBe(200);
    expect(res.body.bookings.map((b) => b.name)).toEqual(["Alice"]);
  });

  it("an admin still receives every booking", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const admin = await makeAdmin();
    await makeBooking(alice, { name: "Alice" });
    await makeBooking(bob, { name: "Bob" });

    const res = await api().get("/api/bookings").set("Cookie", admin.cookie);

    expect(res.body.bookings.map((b) => b.name).sort()).toEqual(["Alice", "Bob"]);
  });
});

describe("SEC-02 public tournament endpoints expose player phone numbers", () => {
  const withTeam = async () => {
    const captain = await makeUser();
    return makeTournament({
      registeredTeams: [{ teamName: "Owls", captain: captain.user._id, players: players(5) }],
    });
  };

  it("GET /api/tournaments (no auth) contains no phone numbers", async () => {
    await withTeam();
    const res = await api().get("/api/tournaments");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("9000000000");
  });

  it("GET /api/tournaments/:id (no auth) contains no phone numbers", async () => {
    const t = await withTeam();
    const res = await api().get(`/api/tournaments/${t._id}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("9000000000");
  });
});

describe("SEC-02 rosters stay available to admins and hidden from everyone else", () => {
  const withTeam = async () => {
    const captain = await makeUser();
    return makeTournament({
      registeredTeams: [{ teamName: "Owls", captain: captain.user._id, players: players(5) }],
    });
  };

  it("anonymous callers get only _id, teamName and status per team", async () => {
    const t = await withTeam();
    const res = await api().get(`/api/tournaments/${t._id}`);
    expect(res.body.tournament.registeredTeams).toEqual([
      { _id: t.registeredTeams[0]._id.toString(), teamName: "Owls", status: "Pending" },
    ]);
  });

  it("a logged-in non-admin gets the same trimmed view", async () => {
    await withTeam();
    const { cookie } = await makeUser();
    const res = await api().get("/api/tournaments").set("Cookie", cookie);
    expect(Object.keys(res.body.tournaments[0].registeredTeams[0]).sort()).toEqual([
      "_id",
      "status",
      "teamName",
    ]);
  });

  it("an admin gets full rosters from both endpoints", async () => {
    const t = await withTeam();
    const { cookie } = await makeAdmin();
    const list = await api().get("/api/tournaments").set("Cookie", cookie);
    const one = await api().get(`/api/tournaments/${t._id}`).set("Cookie", cookie);
    expect(list.body.tournaments[0].registeredTeams[0].players).toHaveLength(5);
    expect(one.body.tournament.registeredTeams[0].players[0].phone).toBe("9000000000");
  });

  it("an invalid cookie is treated as anonymous, not as an error", async () => {
    await withTeam();
    const res = await api().get("/api/tournaments").set("Cookie", "token=garbage");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("9000000000");
  });
});

describe("SEC-03 booking creation does not trust the client", () => {
  it("the price is not taken from the request", async () => {
    await seedStations();
    const { cookie } = await makeUser();
    const res = await api()
      .post("/api/bookings")
      .set("Cookie", cookie)
      .send(bookingPayload({ totalAmount: 1 }));

    // Whatever the server decides (reject or recompute), it must not store 1.
    const stored = await models.Booking.findOne().lean();
    expect(stored ? stored.totalAmount : null).not.toBe(1);
    expect(res.status).toBeLessThan(500);
  });

  it("a station that is already occupied cannot be booked again", async () => {
    await seedStations();
    const alice = await makeUser();
    const bob = await makeUser();
    const first = await api()
      .post("/api/bookings")
      .set("Cookie", alice.cookie)
      .send(bookingPayload({ stations: ["PC-01"] }));
    expect(first.status).toBe(201);

    const second = await api()
      .post("/api/bookings")
      .set("Cookie", bob.cookie)
      .send(bookingPayload({ stations: ["PC-01"] }));

    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(second.status).toBeLessThan(500);
  });

  it("a station under maintenance cannot be booked", async () => {
    await seedStations();
    await models.Station.updateOne({ stationId: "PC-03" }, { status: "Maintenance" });
    const { cookie } = await makeUser();

    await api()
      .post("/api/bookings")
      .set("Cookie", cookie)
      .send(bookingPayload({ stations: ["PC-03"] }));

    expect((await models.Station.findOne({ stationId: "PC-03" })).status).toBe("Maintenance");
  });

  it("a station id that does not exist is rejected", async () => {
    await seedStations();
    const { cookie } = await makeUser();
    const res = await api()
      .post("/api/bookings")
      .set("Cookie", cookie)
      .send(bookingPayload({ stations: ["PC-99"] }));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("SEC-04 NoSQL operator injection on login", () => {
  it.each([{ $gt: "" }, { $ne: null }, { $regex: ".*" }])(
    "email %j does not log in as an existing user",
    async (email) => {
      await makeUser(); // victim; attacker only knows/guesses a password
      const res = await api().post("/api/users/login").send({ email, password: PASSWORD });

      expect(res.status).not.toBe(200);
      expect(res.headers["set-cookie"]).toBeUndefined();
    },
  );

  it("an object-valued email is rejected as bad input (400), not looked up", async () => {
    const res = await api()
      .post("/api/users/login")
      .send({ email: { $gt: "" }, password: "x" });
    expect(res.status).toBe(400);
  });
});

describe("SEC-04 operator injection is refused everywhere", () => {
  it("an object-valued email on register is a 400 and creates nothing", async () => {
    const res = await api()
      .post("/api/users/register")
      .send({ username: "inj", email: { $ne: null }, password: PASSWORD });
    expect(res.status).toBe(400);
    expect(await models.User.countDocuments()).toBe(0);
  });

  it("a non-string password is a 400, not a bcrypt crash", async () => {
    const { user } = await makeUser();
    const res = await api()
      .post("/api/users/login")
      .send({ email: user.email, password: { $gt: "" } });
    expect(res.status).toBe(400);
  });

  it("any body with a $-prefixed or dotted key is refused, at any depth", async () => {
    const { cookie } = await makeUser();
    for (const body of [{ stationId: { $ne: null } }, { a: [{ "b.c": 1 }] }]) {
      const res = await api().post("/api/users/wishlist").set("Cookie", cookie).send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, message: "Invalid request." });
    }
  });

  it("mongoose sanitizeFilter is on, so an operator object in a filter cannot match", async () => {
    await makeUser();
    // Wrapped in $eq, the object is cast against the String path and refused.
    await expect(models.User.findOne({ email: { $ne: null } })).rejects.toThrow(/Cast to string failed/);
  });
});

describe("SEC-05 cross-site request forgery", () => {
  const FRONTEND = "https://frontend.example.test"; // FRONTEND_URL in tests/setup
  const formBody =
    "name=x&email=x%40example.test&phone=9000000000&bookingType=PC&membersCount=1" +
    "&stations[]=PC-01&totalAmount=0" +
    "&bookingTime[start]=2030-01-10T10:00:00.000Z&bookingTime[end]=2030-01-10T12:00:00.000Z";

  it("a form POST from another origin cannot create a booking", async () => {
    await seedStations();
    const { cookie } = await makeUser();

    // What <form method="post" enctype="application/x-www-form-urlencoded">
    // on attacker.example would send; the browser attaches the cookie.
    const res = await api()
      .post("/api/bookings")
      .set("Cookie", cookie)
      .set("Origin", "https://attacker.example")
      .type("form")
      .send(formBody);

    expect(await models.Booking.countDocuments()).toBe(0);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: "Origin not allowed." });
  });

  it("form-encoded bodies are refused even without an Origin header (415)", async () => {
    const { cookie } = await makeUser();
    const res = await api().post("/api/bookings").set("Cookie", cookie).type("form").send(formBody);
    expect(res.status).toBe(415);
  });

  it("the text/plain trick (JSON smuggled in a form) is refused", async () => {
    await seedStations();
    const { cookie } = await makeUser();
    const res = await api()
      .post("/api/bookings")
      .set("Cookie", cookie)
      .set("Content-Type", "text/plain")
      .send(JSON.stringify(bookingPayload()));

    expect(res.status).toBe(415);
    expect(await models.Booking.countDocuments()).toBe(0);
  });

  it("a JSON request from a foreign origin is refused on every state-changing method", async () => {
    const owner = await makeUser();
    const booking = await makeBooking(owner);
    const from = (req) => req.set("Cookie", owner.cookie).set("Origin", "https://attacker.example");

    expect((await from(api().put(`/api/bookings/${booking._id}`)).send({ phone: "9111111111" })).status).toBe(403);
    expect((await from(api().delete(`/api/bookings/${booking._id}`))).status).toBe(403);
    expect((await from(api().post("/api/users/logout"))).status).toBe(403);
    expect(await models.Booking.countDocuments()).toBe(1);
  });

  it("the sandboxed-iframe origin \"null\" is refused", async () => {
    const res = await api().post("/api/users/logout").set("Origin", "null");
    expect(res.status).toBe(403);
  });

  it("the real frontend origin is accepted", async () => {
    await seedStations();
    const { cookie } = await makeUser();
    const res = await api()
      .post("/api/bookings")
      .set("Cookie", cookie)
      .set("Origin", FRONTEND)
      .send(bookingPayload());
    expect(res.status).toBe(201);
  });

  it("reads are not affected by the origin check", async () => {
    const res = await api().get("/api/stations").set("Origin", "https://attacker.example");
    expect(res.status).toBe(200);
  });
});

describe("SEC-06 rate limiting", () => {
  const LIMITED = { success: false, message: expect.stringMatching(/^Too many/) };

  it("repeated failed logins are throttled", async () => {
    const { user } = await makeUser();
    const statuses = [];
    for (let i = 0; i < 30; i += 1) {
      const res = await api()
        .post("/api/users/login")
        .send({ email: user.email, password: `guess-${i}` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses.slice(10)).toEqual(Array(20).fill(429));
  });

  it("once throttled, even the correct password is refused until the window ends", async () => {
    const { user, password } = await makeUser();
    for (let i = 0; i < 10; i += 1) {
      await api().post("/api/users/login").send({ email: user.email, password: "wrong" });
    }
    const res = await api().post("/api/users/login").send({ email: user.email, password });
    expect(res.status).toBe(429);
    expect(res.body).toEqual(LIMITED);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("successful logins do not use up the allowance", async () => {
    const { user, password } = await makeUser();
    for (let i = 0; i < 15; i += 1) {
      const res = await api().post("/api/users/login").send({ email: user.email, password });
      expect(res.status).toBe(200);
    }
  });

  it("account creation is throttled", async () => {
    const statuses = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await api()
        .post("/api/users/register")
        .send({ username: `bulk${i}`, email: `bulk${i}@example.test`, password: PASSWORD });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 201)).toHaveLength(10);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("the public contact form is throttled", async () => {
    const statuses = [];
    for (let i = 0; i < 60; i += 1) {
      const res = await api()
        .post("/api/messages")
        .send({ name: "Spam", email: "spam@example.test", message: `spam message ${i}` });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
    expect(await models.Message.countDocuments()).toBe(10);
  });

  it("limits are announced with RateLimit headers and a JSON 429", async () => {
    const res = await api().get("/api/stations");
    expect(res.headers["ratelimit"]).toMatch(/limit=600/);
  });
});

describe("SEC-07 known-vulnerable dependency versions are installed", () => {

  it("mongoose is at a patched version (>= 8.24.7)", () => {
    expect(atLeast(installed("mongoose"), "8.24.7")).toBe(true);
  });

  it("zod is at a patched version (>= 4.6.6)", () => {
    expect(atLeast(installed("zod"), "4.6.6")).toBe(true);
  });

  it("body-parser is at a patched version (> 2.3.0)", () => {
    const v = installed("body-parser");
    expect(atLeast(v, "2.3.0") && v !== "2.3.0").toBe(true);
  });
});

describe("SEC-07 unused packages stay out of the manifest", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  it.each([
    "axios",
    "connect-flash",
    "ejs",
    "ejs-mate",
    "express-ejs-layouts",
    "express-session",
    "method-override",
    "passport",
    "passport-local",
    "passport-local-mongoose",
    "nodemon",
  ])("%s is not a dependency", (name) => {
    expect(manifest.dependencies).not.toHaveProperty(name);
    expect(manifest.devDependencies).not.toHaveProperty(name);
  });

  it("proxy-addr is at a patched version (> 2.0.7), since trust proxy is now on", () => {
    expect(atLeast(installed("proxy-addr"), "2.0.8")).toBe(true);
  });
});

describe("SEC-08 security headers", () => {
  it("X-Powered-By is not sent", async () => {
    const res = await api().get("/api/stations");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("X-Content-Type-Options: nosniff is sent", async () => {
    const res = await api().get("/api/stations");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("HSTS, a deny-all CSP and frame protection are sent, on errors too", async () => {
    for (const url of ["/api/stations", "/api/does-not-exist"]) {
      const res = await api().get(url);
      expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
      expect(res.headers["content-security-policy"]).toBe(
        "default-src 'none';frame-ancestors 'none'",
      );
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    }
  });
});

describe("SEC-09 logout invalidates the token", () => {
  const login = async (user, password) => {
    const res = await api().post("/api/users/login").send({ email: user.email, password });
    return res.headers["set-cookie"][0].split(";")[0];
  };
  const profile = (cookie) => api().get("/api/users/profile").set("Cookie", cookie);

  it("a token captured before logout stops working after logout", async () => {
    const { user, password } = await makeUser();
    const stolen = await login(user, password);
    expect((await profile(stolen)).status).toBe(200);

    await api().post("/api/users/logout").set("Cookie", stolen);

    const after = await profile(stolen);
    expect(after.status).toBe(401);
    expect(after.body).toEqual({ success: false, message: "Invalid or expired token." });
  });

  it("logout revokes every session of that user, and a new login works again", async () => {
    const { user, password } = await makeUser();
    const laptop = await login(user, password);
    const phone = await login(user, password);

    await api().post("/api/users/logout").set("Cookie", laptop);

    expect((await profile(phone)).status).toBe(401);
    const fresh = await login(user, password);
    expect((await profile(fresh)).status).toBe(200);
  });

  it("one user's logout does not touch anyone else's session", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    await api().post("/api/users/logout").set("Cookie", alice.cookie);

    expect((await profile(alice.cookie)).status).toBe(401);
    expect((await profile(bob.cookie)).status).toBe(200);
  });

  it("a revoked token cannot be used to revoke the new session (replayed logout)", async () => {
    const { user, password } = await makeUser();
    const old = await login(user, password);
    await api().post("/api/users/logout").set("Cookie", old);
    const fresh = await login(user, password);

    const replay = await api().post("/api/users/logout").set("Cookie", old);

    expect(replay.status).toBe(200);
    expect((await profile(fresh)).status).toBe(200);
  });

  it("a revoked admin token loses admin routes and the admin view of rosters", async () => {
    const admin = await makeAdmin();
    const captain = await makeUser();
    await makeTournament({
      registeredTeams: [{ teamName: "Owls", captain: captain.user._id, players: players(5) }],
    });
    await api().post("/api/users/logout").set("Cookie", admin.cookie);

    expect((await api().get("/api/admin/dashboard").set("Cookie", admin.cookie)).status).toBe(401);
    const list = await api().get("/api/tournaments").set("Cookie", admin.cookie);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain("9000000000");
  });

  it("logout still answers 200 with no cookie or a garbage cookie", async () => {
    expect((await api().post("/api/users/logout")).status).toBe(200);
    expect((await api().post("/api/users/logout").set("Cookie", "token=garbage")).status).toBe(200);
  });

  it("tokens issued before tokenVersion existed (no tv claim) keep working until logout", async () => {
    const legacy = await makeUser(); // helper signs { userId } only
    await models.User.collection.updateOne({ _id: legacy.user._id }, { $unset: { tokenVersion: "" } });

    expect((await profile(legacy.cookie)).status).toBe(200);
    await api().post("/api/users/logout").set("Cookie", legacy.cookie);
    expect((await profile(legacy.cookie)).status).toBe(401);
  });

  it("tokenVersion is never sent to the client", async () => {
    const { user, password } = await makeUser();
    const res = await api().post("/api/users/login").send({ email: user.email, password });
    const me = await profile(res.headers["set-cookie"][0].split(";")[0]);

    expect(res.body.user).not.toHaveProperty("tokenVersion");
    expect(me.body.user).not.toHaveProperty("tokenVersion");
  });
});

describe("SEC-10 a missing or weak JWT_SECRET is detected and never leaks library internals", () => {
  const original = process.env.JWT_SECRET;
  afterEach(() => {
    process.env.JWT_SECRET = original;
  });

  it("register does not answer with the jsonwebtoken error text", async () => {
    delete process.env.JWT_SECRET;
    const res = await api().post("/api/users/register").send({
      username: "nosecret",
      email: "nosecret@example.test",
      password: PASSWORD,
    });
    expect(res.body.message || "").not.toMatch(/secretOrPrivateKey/i);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Server configuration error." });
    expect(await models.User.countDocuments()).toBe(0); // no half-created account
  });

  describe("boot-time check (config/env.js)", () => {
    const { envProblems, validateEnv } = require("../../config/env");
    const good = {
      MONGO_URI: "mongodb://127.0.0.1/x",
      JWT_SECRET: "s".repeat(32),
      NODE_ENV: "production",
      FRONTEND_URL: "https://frontend.example.test",
    };

    it("accepts a complete configuration", () => {
      expect(envProblems(good)).toEqual([]);
      expect(() => validateEnv(good)).not.toThrow();
    });

    it.each([
      ["MONGO_URI", "MONGO_URI is not set"],
      ["JWT_SECRET", "JWT_SECRET is not set"],
      ["FRONTEND_URL", "FRONTEND_URL is not set (required in production)"],
    ])("refuses to start without %s", (name, problem) => {
      const { [name]: _removed, ...env } = good;
      expect(envProblems(env)).toEqual([problem]);
      expect(() => validateEnv(env)).toThrow(/Invalid environment configuration/);
    });

    it("refuses a JWT_SECRET shorter than 32 characters, without echoing it", () => {
      const env = { ...good, JWT_SECRET: "short-secret" };
      expect(envProblems(env)).toEqual(["JWT_SECRET must be at least 32 characters"]);
      expect(() => validateEnv(env)).toThrow(expect.not.stringContaining("short-secret"));
    });

    it("server.js runs the check before anything else", () => {
      const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
      expect(server.indexOf("validateEnv()")).toBeGreaterThan(-1);
      expect(server.indexOf("validateEnv()")).toBeLessThan(server.indexOf("mongoose.connect"));
    });
  });
});

describe("SEC-11 password policy and input validation on register", () => {
  it("a one-character password is rejected", async () => {
    const res = await api()
      .post("/api/users/register")
      .send({ username: "weak", email: "weak@example.test", password: "1" });
    expect(res.status).toBe(400);
  });

  it("a string that is not an email address is rejected", async () => {
    const res = await api()
      .post("/api/users/register")
      .send({ username: "noemail", email: "not-an-email", password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it.each([
    ["7-character password", { password: "Abc123!" }, "Password must be at least 8 characters"],
    ["129-character password", { password: "a".repeat(129) }, "Password must be at most 128 characters"],
    ["2-character username", { username: "ab" }, "Username must be at least 3 characters"],
    ["username with markup", { username: "<script>" }, "Username can only contain letters, numbers, spaces, _ . and -"],
    ["phone that is not a number", { phone: "call me" }, "Phone number is not valid"],
    ["missing email", { email: undefined }, "Invalid email format"],
  ])("%s is rejected with a clear message and no account", async (_label, overrides, message) => {
    const res = await api()
      .post("/api/users/register")
      .send({ username: "valid_name", email: "valid@example.test", password: PASSWORD, ...overrides });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message });
    expect(await models.User.countDocuments()).toBe(0);
  });

  it("passwords are stored with bcrypt at cost 10 or higher", async () => {
    const { user } = await makeUser();
    const { password } = await models.User.findById(user._id).select("+password");
    expect(Number(password.split("$")[2])).toBeGreaterThanOrEqual(10);
  });
});

describe("SEC-12 register never returns raw database error text", () => {
  it("a duplicate username does not leak the MongoDB error", async () => {
    const { user } = await makeUser();
    const res = await api().post("/api/users/register").send({
      username: user.username,
      email: "different@example.test",
      password: PASSWORD,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.message).not.toMatch(/E11000|dup key|index:/);
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ success: false, message: "Username is already taken" });
  });

  it("an unexpected database failure is a generic 500, logged server-side only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi
      .spyOn(models.User.prototype, "save")
      .mockRejectedValue(new Error("connection pool to cluster0-shard-00 destroyed"));
    try {
      const res = await api()
        .post("/api/users/register")
        .send({ username: "unlucky", email: "unlucky@example.test", password: PASSWORD });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, message: "Server error during registration" });
      expect(log).toHaveBeenCalledWith("Register failed:", expect.stringContaining("cluster0"));
    } finally {
      save.mockRestore();
      log.mockRestore();
    }
  });
});

describe("SEC-13 auth cookie flags", () => {
  const loginCookie = async () => {
    const { user, password } = await makeUser();
    const res = await api().post("/api/users/login").send({ email: user.email, password });
    return res.headers["set-cookie"][0];
  };

  it("the cookie has an explicit lifetime (Max-Age or Expires)", async () => {
    expect(await loginCookie()).toMatch(/Max-Age=|Expires=/i);
  });

  it("the cookie is never SameSite=None without Secure", async () => {
    const cookie = await loginCookie(); // NODE_ENV is not production here
    const sameSiteNone = /SameSite=None/i.test(cookie);
    const secure = /;\s*Secure/i.test(cookie);
    expect(sameSiteNone && !secure).toBe(false);
  });

  it("outside production: HttpOnly, SameSite=Lax, Path=/, Max-Age of 7 days", async () => {
    const cookie = await loginCookie();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=604800(;|$)/i);
  });

  it("register and logout use the same attributes as login", async () => {
    const attrs = (cookie) =>
      cookie
        .split(";")
        .slice(1)
        .map((part) => part.trim().split("=")[0].toLowerCase())
        .filter((name) => !["max-age", "expires"].includes(name))
        .sort();

    const login = await loginCookie();
    const register = (
      await api()
        .post("/api/users/register")
        .send({ username: "cookie_user", email: "cookie@example.test", password: PASSWORD })
    ).headers["set-cookie"][0];
    const logout = (await api().post("/api/users/logout")).headers["set-cookie"][0];

    expect(attrs(register)).toEqual(attrs(login));
    expect(attrs(logout)).toEqual(attrs(login));
    expect(register).toMatch(/Max-Age=604800/i);
  });
});

describe("SEC-15 seed scripts cannot wipe a production database", () => {
  const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

  // Static check on purpose: these scripts connect to MONGO_URI from .env and
  // delete data, so tests must never execute them.
  it.each(["init/index.js", "seedStations.js"])(
    "%s refuses to run when NODE_ENV is production",
    (file) => {
      expect(source(file)).toMatch(/NODE_ENV/);
    },
  );

  it("the sample users file contains no literal passwords", () => {
    expect(source("init/data.js")).not.toMatch(/password:\s*["'`]/);
  });

  describe("the shared guard (init/guard.js)", () => {
    const { assertSafeToSeed } = require("../../init/guard");
    const uri = "mongodb://127.0.0.1/x";

    it("allows development", () => {
      expect(() => assertSafeToSeed("seed", { MONGO_URI: uri })).not.toThrow();
    });

    it("refuses production", () => {
      expect(() => assertSafeToSeed("seed", { MONGO_URI: uri, NODE_ENV: "production" })).toThrow(
        /refusing to run with NODE_ENV=production/,
      );
    });

    it("allows production only with the explicit opt-in", () => {
      expect(() =>
        assertSafeToSeed("seed", { MONGO_URI: uri, NODE_ENV: "production", ALLOW_PRODUCTION_SEED: "yes" }),
      ).not.toThrow();
    });

    it("refuses to run without MONGO_URI", () => {
      expect(() => assertSafeToSeed("seed", {})).toThrow(/MONGO_URI is not set/);
    });
  });

  it.each(["init/index.js", "seedStations.js"])("%s calls the guard before connecting", (file) => {
    const text = source(file);
    expect(text.indexOf("assertSafeToSeed(")).toBeGreaterThan(-1);
    expect(text.indexOf("assertSafeToSeed(")).toBeLessThan(text.indexOf("mongoose.connect("));
  });

  it("the station seed no longer deletes anything", () => {
    expect(source("seedStations.js")).not.toMatch(/deleteMany|drop\(/);
  });
});

describe("SEC-16 env files are git-ignored", () => {
  // Reads .gitignore directly (no git process needed). Covers the plain
  // file-name patterns this repo uses; `*` matches any run of characters.
  const ignoredByGitignore = (fileName) =>
    fs
      .readFileSync(path.join(ROOT, ".gitignore"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
      .some((pattern) => {
        const body = pattern.replace(/^\//, "").replace(/[.+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`^${body.replace(/\*/g, ".*")}$`).test(fileName);
      });

  it("sanity: the matcher sees that .env is ignored", () => {
    expect(ignoredByGitignore(".env")).toBe(true);
  });

  it(".gitignore covers .env.test", () => {
    expect(ignoredByGitignore(".env.test")).toBe(true);
  });

  it.each([".env.local", ".env.production", ".env.test.local"])("%s is ignored too", (name) => {
    expect(ignoredByGitignore(name)).toBe(true);
  });

  it(".env.example is committed, lists every variable the code reads, and holds no values", () => {
    const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^!\.env\.example$/m);

    const example = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
    const assignments = example.split("\n").filter((line) => /^[A-Z_]+=/.test(line));
    for (const line of assignments) expect(line).toMatch(/^[A-Z_]+=$/); // name only

    // Every process.env.X read anywhere in the app must be documented.
    const files = ["app.js", "server.js", "middleware.js", "seedStations.js"];
    for (const dir of ["config", "utils", "controllers", "routes", "models", "init"]) {
      for (const f of fs.readdirSync(path.join(ROOT, dir))) files.push(path.join(dir, f));
    }
    const used = new Set();
    for (const file of files) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const [, name] of text.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) used.add(name);
    }
    used.delete("CLIENT_URL"); // deprecated alias of FRONTEND_URL, documented in a comment

    const documented = assignments.map((line) => line.split("=")[0]);
    expect([...used].filter((name) => !documented.includes(name))).toEqual([]);
  });
});

describe("SEC-17 owner check and update validation", () => {
  it("the owner can read their own booking by id", async () => {
    const owner = await makeUser();
    const booking = await makeBooking(owner);
    const res = await api().get(`/api/bookings/${booking._id}`).set("Cookie", owner.cookie);
    expect(res.status).toBe(200);
  });

  it("a tournament cannot be updated to an invalid status", async () => {
    const t = await makeTournament();
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/tournaments/${t._id}`)
      .set("Cookie", cookie)
      .send({ status: "Hacked" });

    expect((await models.Tournament.findById(t._id).lean()).status).toBe("Upcoming");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Invalid tournament status" });
  });

  it("the populated owner is returned to the owner, and a stranger still gets 403", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const booking = await makeBooking(owner);

    const mine = await api().get(`/api/bookings/${booking._id}`).set("Cookie", owner.cookie);
    expect(mine.body.booking.user).toEqual({
      _id: owner.user._id.toString(),
      username: owner.user.username,
    });

    const theirs = await api().get(`/api/bookings/${booking._id}`).set("Cookie", stranger.cookie);
    expect(theirs.status).toBe(403);
    expect(theirs.body).toEqual({ success: false, message: "Forbidden Access." });
  });

  it.each([
    ["end before start", { eventTime: { start: "2030-03-01T18:00:00.000Z", end: "2030-03-01T10:00:00.000Z" } }, "End time must be after start time"],
    ["zero teams", { maxTeams: 0 }, "Max teams must be at least 1"],
    ["a javascript: thumbnail", { thumbnail: "javascript:alert(1)" }, "Thumbnail must be an http(s) URL"],
    ["rules that are not a list", { rules: "none" }, "Rules must be a list"],
  ])("a tournament update with %s is a 400 and changes nothing", async (_label, body, message) => {
    const t = await makeTournament();
    const { cookie } = await makeAdmin();
    const res = await api().put(`/api/tournaments/${t._id}`).set("Cookie", cookie).send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message });
    expect((await models.Tournament.findById(t._id)).updatedAt).toEqual(t.updatedAt);
  });

  it("what the admin edit form really sends still works (string maxTeams, UI-only fields)", async () => {
    const t = await makeTournament();
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/tournaments/${t._id}`)
      .set("Cookie", cookie)
      .send({
        title: "Renamed",
        maxTeams: "16",
        status: "Live",
        selectedDate: "2030-03-01T00:00:00.000Z",
        startTime: "10:00",
        endTime: "18:00",
        registeredTeams: [], // not editable through this route
      });

    expect(res.status).toBe(200);
    expect(res.body.tournament).toMatchObject({ title: "Renamed", maxTeams: 16, status: "Live" });
    expect(res.body.tournament).not.toHaveProperty("selectedDate");
  });
});

describe("SEC-18 team registration respects tournament state and capacity", () => {
  it.each(["Completed", "Cancelled"])("cannot register for a %s tournament", async (status) => {
    const t = await makeTournament({ status });
    const { cookie } = await makeUser();
    const res = await api()
      .post(`/api/tournaments/${t._id}/register`)
      .set("Cookie", cookie)
      .send({ teamName: "Too Late", players: players(5) });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Registration is closed for this tournament",
    });
    expect((await models.Tournament.findById(t._id)).registeredTeams).toHaveLength(0);
  });

  it("concurrent registrations cannot exceed maxTeams", async () => {
    const t = await makeTournament({ maxTeams: 1 });
    const users = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser()]);

    // Make the race real: hold every write until all four requests have passed
    // the friendly pre-check, then let them hit the database together.
    const realWrite = models.Tournament.findOneAndUpdate.bind(models.Tournament);
    let waiting = 0;
    let release;
    const allArrived = new Promise((resolve) => {
      release = resolve;
    });
    const spy = vi
      .spyOn(models.Tournament, "findOneAndUpdate")
      .mockImplementation(async (...args) => {
        waiting += 1;
        if (waiting >= users.length) release();
        await Promise.race([allArrived, new Promise((r) => setTimeout(r, 1000))]);
        return realWrite(...args);
      });

    let responses;
    try {
      responses = await Promise.all(
        users.map((u, i) =>
          api()
            .post(`/api/tournaments/${t._id}/register`)
            .set("Cookie", u.cookie)
            .send({ teamName: `Team ${i}`, players: players(5) }),
        ),
      );
    } finally {
      spy.mockRestore();
    }

    expect(waiting).toBe(4); // all four really did race
    expect((await models.Tournament.findById(t._id)).registeredTeams).toHaveLength(1);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400, 400, 400]);
    expect(responses.filter((r) => r.status === 400).map((r) => r.body.message)).toEqual(
      Array(3).fill("Tournament is full"),
    );
  });

  it("one captain racing themselves ends up with exactly one team", async () => {
    const t = await makeTournament({ maxTeams: 8 });
    const captain = await makeUser();

    const responses = await Promise.all(
      ["Alpha", "Bravo", "Charlie"].map((teamName) =>
        api()
          .post(`/api/tournaments/${t._id}/register`)
          .set("Cookie", captain.cookie)
          .send({ teamName, players: players(5) }),
      ),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await models.Tournament.findById(t._id)).registeredTeams).toHaveLength(1);
  });

  it.each([
    ["4 players", { players: players(4) }, "A team must have exactly 5 or 6 players"],
    ["7 players", { players: players(7) }, "A team must have exactly 5 or 6 players"],
    ["no team name", { teamName: "" }, "Team name too short"],
    ["a player without a phone", { players: players(5).map(({ phone, ...p }) => p) }, "Phone number is required"],
  ])("%s is a 400 with a clear message", async (_label, overrides, message) => {
    const t = await makeTournament();
    const { cookie } = await makeUser();
    const res = await api()
      .post(`/api/tournaments/${t._id}/register`)
      .set("Cookie", cookie)
      .send({ teamName: "Valid Team", players: players(5), ...overrides });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message });
  });
});

describe("SEC-21 malformed ids and bad enum values return 400", () => {
  it("a malformed booking id is a 400", async () => {
    const { cookie } = await makeUser();
    const res = await api().get("/api/bookings/not-an-id").set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("a malformed tournament id is a 400", async () => {
    expect((await api().get("/api/tournaments/not-an-id")).status).toBe(400);
  });

  it("an invalid station status is a 400", async () => {
    const [station] = await seedStations(["PC-01"]);
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/admin/station/${station._id}`)
      .set("Cookie", cookie)
      .send({ status: "On Fire" });
    expect(res.status).toBe(400);
  });

  it("every route with an id parameter answers 400 to a malformed one", async () => {
    const { cookie } = await makeAdmin();
    const good = "65f000000000000000000001";
    const routes = [
      ["get", "/api/bookings/xyz"],
      ["put", "/api/bookings/xyz"],
      ["delete", "/api/bookings/xyz"],
      ["get", "/api/tournaments/xyz"],
      ["put", "/api/tournaments/xyz"],
      ["delete", "/api/tournaments/xyz"],
      ["post", "/api/tournaments/xyz/register"],
      ["put", `/api/tournaments/xyz/team/${good}/status`],
      ["put", `/api/tournaments/${good}/team/xyz/status`],
      ["put", "/api/messages/xyz/read"],
      ["delete", "/api/messages/xyz"],
      ["put", "/api/admin/station/xyz"],
      ["put", "/api/admin/booking/xyz/cancel"],
      ["get", "/api/bookings/65f00000000000000000000g"], // right length, not hex
    ];
    for (const [method, url] of routes) {
      const res = await api()[method](url).set("Cookie", cookie);
      expect([method, url, res.status]).toEqual([method, url, 400]);
      expect(res.body).toEqual({ success: false, message: "Invalid id." });
    }
  });
});

describe("SEC-22 public station list exposes no internal ids", () => {
  it("GET /api/stations does not reveal which user holds a station", async () => {
    await seedStations();
    const { user, cookie } = await makeUser();
    await api().post("/api/bookings").set("Cookie", cookie).send(bookingPayload());

    const res = await api().get("/api/stations");

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(user._id.toString());
  });
});
