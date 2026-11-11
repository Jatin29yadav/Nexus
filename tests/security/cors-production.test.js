// SEC-14 and the CORS contract. The origin list is built when app.js is first
// loaded, so this file sets NODE_ENV before requiring it.
process.env.NODE_ENV = "production";

const { api, vuln, makeUser } = require("../setup/helpers");

const preflight = (origin) =>
  api()
    .options("/api/bookings")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "POST");

describe("CORS", () => {
  it("allows the configured CLIENT_URL with credentials", async () => {
    const res = await preflight("https://frontend.example.test");
    expect(res.headers["access-control-allow-origin"]).toBe("https://frontend.example.test");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not allow an unknown origin", async () => {
    const res = await preflight("https://attacker.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("never answers with a wildcard origin", async () => {
    const res = await api().get("/api/stations").set("Origin", "https://attacker.example");
    expect(res.headers["access-control-allow-origin"]).not.toBe("*");
  });

  vuln("SEC-14: http://localhost:5173 is not an allowed origin in production", async () => {
    const res = await preflight("http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("SEC-13 auth cookie in production", () => {
  const original = process.env.COOKIE_SAMESITE;
  afterEach(() => {
    if (original === undefined) delete process.env.COOKIE_SAMESITE;
    else process.env.COOKIE_SAMESITE = original;
  });

  const loginCookie = async () => {
    const { user, password } = await makeUser();
    const res = await api().post("/api/users/login").send({ email: user.email, password });
    return res.headers["set-cookie"][0];
  };

  it("defaults to HttpOnly; Secure; SameSite=None (cross-site frontend)", async () => {
    delete process.env.COOKIE_SAMESITE;
    const cookie = await loginCookie();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/SameSite=None/i);
  });

  it("COOKIE_SAMESITE=lax (after the Vercel /api rewrite) gives Secure; SameSite=Lax", async () => {
    process.env.COOKIE_SAMESITE = "lax";
    const cookie = await loginCookie();
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("an unknown COOKIE_SAMESITE value falls back to the safe default", async () => {
    process.env.COOKIE_SAMESITE = "whatever";
    const cookie = await loginCookie();
    expect(cookie).toMatch(/SameSite=None/i);
    expect(cookie).toMatch(/;\s*Secure/i);
  });

  it("the logout cookie is Secure too, so the browser actually clears it", async () => {
    const res = await api().post("/api/users/logout");
    expect(res.headers["set-cookie"][0]).toMatch(/^token=;.*Secure/i);
  });
});
