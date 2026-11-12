// SEC-14 and the CORS contract. The origin list is built when app.ts is first
// loaded, so this file sets NODE_ENV before importing it. vi.hoisted runs
// before the imports below.
vi.hoisted(() => {
  process.env.NODE_ENV = "production";
});

import { api, makeUser, firstCookie } from "../setup/helpers";
import { parseOrigins } from "../../src/config/origins";

const preflight = (origin: string) =>
  api()
    .options("/api/bookings")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "POST");

describe("CORS", () => {
  it("allows the configured FRONTEND_URL with credentials", async () => {
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

  it("SEC-14: http://localhost:5173 is not an allowed origin in production", async () => {
    const res = await preflight("http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("SEC-14: a write from localhost:5173 is refused in production", async () => {
    const res = await api().post("/api/users/logout").set("Origin", "http://localhost:5173");
    expect(res.status).toBe(403);
  });

  describe("SEC-14: origin list parsing (config/origins.js)", () => {

    it("accepts a comma-separated FRONTEND_URL and tidies each entry", () => {
      expect(
        parseOrigins({
          NODE_ENV: "production",
          FRONTEND_URL: " https://a.example.test/ , https://b.example.test ,",
        }),
      ).toEqual(["https://a.example.test", "https://b.example.test"]);
    });

    it("falls back to the old CLIENT_URL name", () => {
      expect(parseOrigins({ NODE_ENV: "production", CLIENT_URL: "https://old.example.test" })).toEqual([
        "https://old.example.test",
      ]);
    });

    it("an unset value never becomes an allowed origin", () => {
      expect(parseOrigins({ NODE_ENV: "production" })).toEqual([]);
    });

    it("adds the Vite dev origin only outside production", () => {
      expect(parseOrigins({ FRONTEND_URL: "https://a.example.test" })).toEqual([
        "https://a.example.test",
        "http://localhost:5173",
      ]);
    });
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
    return firstCookie(res);
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
    expect(firstCookie(res)).toMatch(/^token=;.*Secure/i);
  });
});
