// JWT handling and "is the check present on every protected route".
// These lock behaviour that is CORRECT today.
const jwt = require("jsonwebtoken");
const { api, makeUser, makeAdmin, signToken, newId, models } = require("../setup/helpers");

const id = newId();

// Every route behind isLoggedIn (docs/API_CONTRACT.md §1).
const USER_ROUTES = [
  ["get", "/api/users/profile"],
  ["post", "/api/users/wishlist"],
  ["post", "/api/bookings"],
  ["get", "/api/bookings"],
  ["get", `/api/bookings/${id}`],
  ["put", `/api/bookings/${id}`],
  ["delete", `/api/bookings/${id}`],
  ["post", `/api/tournaments/${id}/register`],
];

// Every route behind isLoggedIn + isAdmin.
const ADMIN_ROUTES = [
  ["post", "/api/tournaments"],
  ["put", `/api/tournaments/${id}`],
  ["delete", `/api/tournaments/${id}`],
  ["put", `/api/tournaments/${id}/team/${id}/status`],
  ["get", "/api/messages"],
  ["put", `/api/messages/${id}/read`],
  ["delete", `/api/messages/${id}`],
  ["get", "/api/admin/dashboard"],
  ["put", `/api/admin/station/${id}`],
  ["put", `/api/admin/booking/${id}/cancel`],
];

describe("every protected route rejects a request with no token", () => {
  it.each([...USER_ROUTES, ...ADMIN_ROUTES])("%s %s → 401", async (method, url) => {
    const res = await api()[method](url);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "No token provided." });
  });
});

describe("every admin route rejects a normal user", () => {
  it.each(ADMIN_ROUTES)("%s %s → 403", async (method, url) => {
    const { cookie } = await makeUser();
    const res = await api()[method](url).set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message: "Unauthorized. Admin Access Required.",
    });
  });
});

describe("token verification", () => {
  const profile = (token) =>
    api().get("/api/users/profile").set("Cookie", `token=${token}`);
  const rejected = { success: false, message: "Invalid or expired token." };

  it("accepts a valid token", async () => {
    const { token } = await makeUser();
    expect((await profile(token)).status).toBe(200);
  });

  it("rejects an expired token", async () => {
    const { user } = await makeUser();
    const res = await profile(signToken(user._id, { expiresIn: -10 }));
    expect(res.status).toBe(401);
    expect(res.body).toEqual(rejected);
  });

  it("rejects a token signed with a different secret", async () => {
    const { user } = await makeUser();
    const forged = jwt.sign({ userId: user._id }, "attacker-secret", { expiresIn: "7d" });
    const res = await profile(forged);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(rejected);
  });

  it("rejects a token whose payload was tampered with", async () => {
    const victim = await makeAdmin();
    const attacker = await makeUser();
    const [header, , signature] = attacker.token.split(".");
    const payload = Buffer.from(
      JSON.stringify({ userId: victim.user._id, iat: 1, exp: 9999999999 }),
    ).toString("base64url");

    const res = await profile(`${header}.${payload}.${signature}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(rejected);
  });

  it("rejects an unsigned (alg: none) token", async () => {
    const { user } = await makeAdmin();
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ userId: user._id })}.`;

    const res = await profile(unsigned);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(rejected);
  });

  it("rejects garbage", async () => {
    const res = await profile("not-a-jwt");
    expect(res.status).toBe(401);
    expect(res.body).toEqual(rejected);
  });

  it("rejects a valid token whose user was deleted", async () => {
    const { user, token } = await makeUser();
    await models.User.deleteOne({ _id: user._id });

    const res = await profile(token);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "User not found in database." });
  });

  it("ignores an Authorization header — the cookie is the only credential", async () => {
    const { token } = await makeUser();
    const res = await api().get("/api/users/profile").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("a user cannot make themselves admin through any documented write", async () => {
    const { user, cookie } = await makeUser();
    await api().post("/api/users/wishlist").set("Cookie", cookie).send({ stationId: "PC-01", role: "Admin" });
    expect((await models.User.findById(user._id)).role).toBe("User");
  });
});
