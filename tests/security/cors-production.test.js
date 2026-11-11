// SEC-14 and the CORS contract. The origin list is built when app.js is first
// loaded, so this file sets NODE_ENV before requiring it.
process.env.NODE_ENV = "production";

const { api, vuln } = require("../setup/helpers");

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
