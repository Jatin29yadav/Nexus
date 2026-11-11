// Contract: docs/API_CONTRACT.md §1.1 Users. Locks CURRENT behaviour.
const { api, makeUser, models, PASSWORD } = require("../setup/helpers");

const keys = (o) => Object.keys(o).sort();
const cookiesOf = (res) => res.headers["set-cookie"] || [];

describe("POST /api/users/register", () => {
  const body = {
    username: "newbie",
    email: "newbie@example.test",
    phone: "9000000001",
    password: PASSWORD,
  };

  it("201: creates the user, returns { _id, email, username, phone, role } and sets the auth cookie", async () => {
    const res = await api().post("/api/users/register").send(body);

    expect(res.status).toBe(201);
    expect(keys(res.body)).toEqual(["success", "user"]);
    expect(res.body.success).toBe(true);
    expect(keys(res.body.user)).toEqual(["_id", "email", "phone", "role", "username"]);
    expect(res.body.user).toMatchObject({ email: body.email, username: body.username });

    const [cookie] = cookiesOf(res);
    expect(cookie).toMatch(/^token=[\w-]+\.[\w-]+\.[\w-]+;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i); // not production here; see SEC-13 tests
  });

  it("stores a bcrypt hash, never the plain password, and defaults role to User", async () => {
    await api().post("/api/users/register").send({ ...body, role: "Admin" });
    const saved = await models.User.findOne({ email: body.email }).select("+password");

    expect(saved.password).not.toBe(PASSWORD);
    expect(saved.password).toMatch(/^\$2[aby]\$10\$/);
    expect(saved.role).toBe("User"); // role cannot be mass-assigned
  });

  it("422: email already registered", async () => {
    await api().post("/api/users/register").send(body);
    const res = await api()
      .post("/api/users/register")
      .send({ ...body, username: "someone-else" });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      success: false,
      message: "User already exists with this email",
    });
  });

  it("400: missing required field returns the error envelope", async () => {
    const { password, ...withoutPassword } = body;
    const res = await api().post("/api/users/register").send(withoutPassword);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe("string");
  });
});

describe("POST /api/users/login", () => {
  it("200: returns { _id, email, username, phone, role } and sets the cookie (ML-011)", async () => {
    const { user, password } = await makeUser();
    const res = await api()
      .post("/api/users/login")
      .send({ email: user.email, password });

    expect(res.status).toBe(200);
    expect(keys(res.body)).toEqual(["success", "user"]);
    expect(keys(res.body.user)).toEqual(["_id", "email", "phone", "role", "username"]);
    expect(res.body.user._id).toBe(user._id.toString());
    expect(res.body.user.role).toBe("User");
    expect(res.body.user).not.toHaveProperty("password");
    expect(cookiesOf(res)[0]).toMatch(/^token=.+HttpOnly/i);
  });

  it("401: wrong password", async () => {
    const { user } = await makeUser();
    const res = await api()
      .post("/api/users/login")
      .send({ email: user.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Invalid Email or Password" });
    expect(cookiesOf(res)).toHaveLength(0);
  });

  it("401: unknown email gets the same message as a wrong password", async () => {
    const res = await api()
      .post("/api/users/login")
      .send({ email: "nobody@example.test", password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Invalid Email or Password" });
  });

  it("400: missing password (SEC-04)", async () => {
    const { user } = await makeUser();
    const res = await api().post("/api/users/login").send({ email: user.email });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Password is required" });
  });
});

describe("POST /api/users/logout", () => {
  it("200: clears the cookie, no auth needed", async () => {
    const res = await api().post("/api/users/logout");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Logged out successfully." });
    expect(cookiesOf(res)[0]).toMatch(/^token=;/);
    expect(cookiesOf(res)[0]).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe("GET /api/users/profile", () => {
  it("401: without a cookie", async () => {
    const res = await api().get("/api/users/profile");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "No token provided." });
  });

  it("200: returns the full user without the password", async () => {
    const { user, cookie } = await makeUser();
    const res = await api().get("/api/users/profile").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(keys(res.body.user)).toEqual([
      "__v",
      "_id",
      "bookings",
      "createdAt",
      "email",
      "phone",
      "role",
      "updatedAt",
      "username",
      "wishlist",
    ]);
    expect(res.body.user).toMatchObject({
      _id: user._id.toString(),
      email: user.email,
      username: user.username,
      phone: "9000000000",
      role: "User",
      wishlist: [],
      bookings: [],
    });
  });
});

describe("POST /api/users/wishlist", () => {
  it("401: without a cookie", async () => {
    const res = await api().post("/api/users/wishlist").send({ stationId: "PC-01" });
    expect(res.status).toBe(401);
  });

  it("400: stationId missing", async () => {
    const { cookie } = await makeUser();
    const res = await api().post("/api/users/wishlist").set("Cookie", cookie).send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Station ID is required" });
  });

  it("200: toggles the station in and out of the wishlist", async () => {
    const { cookie } = await makeUser();

    const added = await api()
      .post("/api/users/wishlist")
      .set("Cookie", cookie)
      .send({ stationId: "PC-01" });
    expect(added.status).toBe(200);
    expect(added.body).toEqual({
      success: true,
      message: "PC-01 added to wishlist",
      wishlist: ["PC-01"],
    });

    const removed = await api()
      .post("/api/users/wishlist")
      .set("Cookie", cookie)
      .send({ stationId: "PC-01" });
    expect(removed.body).toEqual({
      success: true,
      message: "PC-01 removed from wishlist",
      wishlist: [],
    });
  });
});
