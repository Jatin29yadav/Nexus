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
  vuln.each([{ $gt: "" }, { $ne: null }, { $regex: ".*" }])(
    "email %j does not log in as an existing user",
    async (email) => {
      await makeUser(); // victim; attacker only knows/guesses a password
      const res = await api().post("/api/users/login").send({ email, password: PASSWORD });

      expect(res.status).not.toBe(200);
      expect(res.headers["set-cookie"]).toBeUndefined();
    },
  );

  vuln("an object-valued email is rejected as bad input (400), not looked up", async () => {
    const res = await api()
      .post("/api/users/login")
      .send({ email: { $gt: "" }, password: "x" });
    expect(res.status).toBe(400);
  });
});

describe("SEC-05 cross-site request forgery via form-encoded POST", () => {
  // Passes since SEC-03 (the form body no longer validates). The real fix,
  // and the tests that pin it, land with the SEC-05 commit.
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
      .send(
        "name=x&email=x%40example.test&phone=9000000000&bookingType=PC&membersCount=1" +
          "&stations[]=PC-01&totalAmount=0" +
          "&bookingTime[start]=2030-01-10T10:00:00.000Z&bookingTime[end]=2030-01-10T12:00:00.000Z",
      );

    expect(await models.Booking.countDocuments()).toBe(0);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("SEC-06 no rate limiting", () => {
  vuln("repeated failed logins are throttled", async () => {
    const { user } = await makeUser();
    const statuses = [];
    for (let i = 0; i < 30; i += 1) {
      const res = await api()
        .post("/api/users/login")
        .send({ email: user.email, password: `guess-${i}` });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  vuln("the public contact form is throttled", async () => {
    const statuses = [];
    for (let i = 0; i < 60; i += 1) {
      const res = await api()
        .post("/api/messages")
        .send({ name: "Spam", email: "spam@example.test", message: `spam message ${i}` });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});

describe("SEC-07 known-vulnerable dependency versions are installed", () => {
  const installed = (name) => require(`${name}/package.json`).version;

  vuln("mongoose is at a patched version (>= 8.24.7)", () => {
    expect(atLeast(installed("mongoose"), "8.24.7")).toBe(true);
  });

  vuln("zod is at a patched version (>= 4.6.6)", () => {
    expect(atLeast(installed("zod"), "4.6.6")).toBe(true);
  });

  vuln("body-parser is at a patched version (> 2.3.0)", () => {
    const v = installed("body-parser");
    expect(atLeast(v, "2.3.0") && v !== "2.3.0").toBe(true);
  });
});

describe("SEC-08 security headers are missing", () => {
  vuln("X-Powered-By is not sent", async () => {
    const res = await api().get("/api/stations");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  vuln("X-Content-Type-Options: nosniff is sent", async () => {
    const res = await api().get("/api/stations");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("SEC-09 logout does not invalidate the token", () => {
  vuln("a token captured before logout stops working after logout", async () => {
    const { user, password } = await makeUser();
    const login = await api().post("/api/users/login").send({ email: user.email, password });
    const stolen = login.headers["set-cookie"][0].split(";")[0];
    expect((await api().get("/api/users/profile").set("Cookie", stolen)).status).toBe(200);

    await api().post("/api/users/logout").set("Cookie", stolen);

    const after = await api().get("/api/users/profile").set("Cookie", stolen);
    expect(after.status).toBe(401);
  });
});

describe("SEC-10 a missing JWT_SECRET is not detected and leaks library internals", () => {
  const original = process.env.JWT_SECRET;
  afterEach(() => {
    process.env.JWT_SECRET = original;
  });

  vuln("register does not answer with the jsonwebtoken error text", async () => {
    delete process.env.JWT_SECRET;
    const res = await api().post("/api/users/register").send({
      username: "nosecret",
      email: "nosecret@example.test",
      password: PASSWORD,
    });
    expect(res.body.message || "").not.toMatch(/secretOrPrivateKey/i);
  });
});

describe("SEC-11 no password policy or input validation on register", () => {
  vuln("a one-character password is rejected", async () => {
    const res = await api()
      .post("/api/users/register")
      .send({ username: "weak", email: "weak@example.test", password: "1" });
    expect(res.status).toBe(400);
  });

  vuln("a string that is not an email address is rejected", async () => {
    const res = await api()
      .post("/api/users/register")
      .send({ username: "noemail", email: "not-an-email", password: PASSWORD });
    expect(res.status).toBe(400);
  });
});

describe("SEC-12 register returns raw database error text", () => {
  vuln("a duplicate username does not leak the MongoDB error", async () => {
    const { user } = await makeUser();
    const res = await api().post("/api/users/register").send({
      username: user.username,
      email: "different@example.test",
      password: PASSWORD,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.message).not.toMatch(/E11000|dup key|index:/);
  });
});

describe("SEC-13 auth cookie flags", () => {
  const loginCookie = async () => {
    const { user, password } = await makeUser();
    const res = await api().post("/api/users/login").send({ email: user.email, password });
    return res.headers["set-cookie"][0];
  };

  vuln("the cookie has an explicit lifetime (Max-Age or Expires)", async () => {
    expect(await loginCookie()).toMatch(/Max-Age=|Expires=/i);
  });

  vuln("the cookie is never SameSite=None without Secure", async () => {
    const cookie = await loginCookie(); // NODE_ENV is not production here
    const sameSiteNone = /SameSite=None/i.test(cookie);
    const secure = /;\s*Secure/i.test(cookie);
    expect(sameSiteNone && !secure).toBe(false);
  });
});

describe("SEC-15 seed scripts can wipe a production database", () => {
  const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

  // Static check on purpose: these scripts connect to MONGO_URI from .env and
  // delete data, so tests must never execute them.
  vuln.each(["init/index.js", "seedStations.js"])(
    "%s refuses to run when NODE_ENV is production",
    (file) => {
      expect(source(file)).toMatch(/NODE_ENV/);
    },
  );

  vuln("the sample users file contains no literal passwords", () => {
    expect(source("init/data.js")).not.toMatch(/password:\s*["'`]/);
  });
});

describe("SEC-16 .env.test is not git-ignored", () => {
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

  vuln(".gitignore covers .env.test", () => {
    expect(ignoredByGitignore(".env.test")).toBe(true);
  });
});

describe("SEC-17 owner check and update validation", () => {
  vuln("the owner can read their own booking by id", async () => {
    const owner = await makeUser();
    const booking = await makeBooking(owner);
    const res = await api().get(`/api/bookings/${booking._id}`).set("Cookie", owner.cookie);
    expect(res.status).toBe(200);
  });

  vuln("a tournament cannot be updated to an invalid status", async () => {
    const t = await makeTournament();
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/tournaments/${t._id}`)
      .set("Cookie", cookie)
      .send({ status: "Hacked" });

    expect((await models.Tournament.findById(t._id).lean()).status).toBe("Upcoming");
    expect(res.status).toBe(400);
  });
});

describe("SEC-18 team registration ignores tournament state", () => {
  vuln.each(["Completed", "Cancelled"])("cannot register for a %s tournament", async (status) => {
    const t = await makeTournament({ status });
    const { cookie } = await makeUser();
    const res = await api()
      .post(`/api/tournaments/${t._id}/register`)
      .set("Cookie", cookie)
      .send({ teamName: "Too Late", players: players(5) });

    expect(res.status).toBe(400);
  });

  vuln("concurrent registrations cannot exceed maxTeams", async () => {
    const t = await makeTournament({ maxTeams: 1 });
    const users = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser()]);

    // Make the race deterministic: hold every save() until all four requests
    // have passed the "is it full?" check (or 1s has gone by, so a fixed
    // implementation that still calls save() is not blocked forever).
    const realSave = models.Tournament.prototype.save;
    let waiting = 0;
    let release;
    const allArrived = new Promise((resolve) => {
      release = resolve;
    });
    const spy = vi
      .spyOn(models.Tournament.prototype, "save")
      .mockImplementation(async function heldSave(...args) {
        waiting += 1;
        if (waiting >= users.length) release();
        await Promise.race([allArrived, new Promise((r) => setTimeout(r, 1000))]);
        return realSave.apply(this, args);
      });

    try {
      await Promise.all(
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

    expect((await models.Tournament.findById(t._id)).registeredTeams.length).toBeLessThanOrEqual(1);
  });
});

describe("SEC-21 malformed ids and bad enum values return 500", () => {
  vuln("a malformed booking id is a 400", async () => {
    const { cookie } = await makeUser();
    const res = await api().get("/api/bookings/not-an-id").set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  vuln("a malformed tournament id is a 400", async () => {
    expect((await api().get("/api/tournaments/not-an-id")).status).toBe(400);
  });

  vuln("an invalid station status is a 400", async () => {
    const [station] = await seedStations(["PC-01"]);
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/admin/station/${station._id}`)
      .set("Cookie", cookie)
      .send({ status: "On Fire" });
    expect(res.status).toBe(400);
  });
});

describe("SEC-22 public station list exposes internal ids", () => {
  vuln("GET /api/stations does not reveal which user holds a station", async () => {
    await seedStations();
    const { user, cookie } = await makeUser();
    await api().post("/api/bookings").set("Cookie", cookie).send(bookingPayload());

    const res = await api().get("/api/stations");

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(user._id.toString());
  });
});
