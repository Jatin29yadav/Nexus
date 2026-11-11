// Contract: docs/API_CONTRACT.md §1.6 Admin and §1.7 fallback.
const {
  api,
  makeUser,
  makeAdmin,
  makeBooking,
  seedStations,
  bookingPayload,
  newId,
  models,
} = require("../setup/helpers");

describe("GET /api/admin/dashboard", () => {
  it("401 / 403: needs an admin", async () => {
    const { cookie } = await makeUser();
    expect((await api().get("/api/admin/dashboard")).status).toBe(401);
    expect((await api().get("/api/admin/dashboard").set("Cookie", cookie)).status).toBe(403);
  });

  it("200: counts and lists with the documented shape", async () => {
    await seedStations(["PC-01", "PC-02", "C-01"]);
    const gamer = await makeUser();
    await makeUser();
    const admin = await makeAdmin();
    const active = await makeBooking(gamer);
    await makeBooking(gamer, { status: "Cancelled" });

    const res = await api().get("/api/admin/dashboard").set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["data", "success"]);
    expect(Object.keys(res.body.data).sort()).toEqual([
      "activeBookingsCount",
      "activeBookingsData",
      "stationsData",
      "totalGamers",
      "totalStations",
    ]);
    expect(res.body.data.totalStations).toBe(3);
    expect(res.body.data.stationsData).toHaveLength(3);
    expect(res.body.data.totalGamers).toBe(2); // admins are not counted
    expect(res.body.data.activeBookingsCount).toBe(1);
    expect(res.body.data.activeBookingsData[0]).toMatchObject({
      _id: active._id.toString(),
      status: "Active",
      user: {
        _id: gamer.user._id.toString(),
        username: gamer.user.username,
        email: gamer.user.email,
      },
    });
  });
});

describe("PUT /api/admin/station/:stationId", () => {
  it("401 / 403: needs an admin", async () => {
    const [station] = await seedStations(["PC-01"]);
    const { cookie } = await makeUser();
    const url = `/api/admin/station/${station._id}`;
    expect((await api().put(url).send({ status: "Maintenance" })).status).toBe(401);
    expect((await api().put(url).set("Cookie", cookie).send({ status: "Maintenance" })).status).toBe(403);
  });

  it("200: updates by Mongo _id", async () => {
    const [station] = await seedStations(["PC-01"]);
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/admin/station/${station._id}`)
      .set("Cookie", cookie)
      .send({ status: "Maintenance" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("PC-01 is now marked as Maintenance");
    expect(res.body.station).toMatchObject({ stationId: "PC-01", status: "Maintenance" });
  });

  it("404: unknown id", async () => {
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/admin/station/${newId()}`)
      .set("Cookie", cookie)
      .send({ status: "Offline" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Station not found" });
  });

  it("500: the human stationId ('PC-01') or a bad status is a server error (current behaviour)", async () => {
    const [station] = await seedStations(["PC-01"]);
    const { cookie } = await makeAdmin();

    const byHumanId = await api()
      .put("/api/admin/station/PC-01")
      .set("Cookie", cookie)
      .send({ status: "Offline" });
    const badStatus = await api()
      .put(`/api/admin/station/${station._id}`)
      .set("Cookie", cookie)
      .send({ status: "On Fire" });

    for (const res of [byHumanId, badStatus]) {
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, message: "Error updating station status" });
    }
  });
});

describe("PUT /api/admin/booking/:bookingId/cancel", () => {
  it("401 / 403: needs an admin", async () => {
    const owner = await makeUser();
    const booking = await makeBooking(owner);
    const url = `/api/admin/booking/${booking._id}/cancel`;
    expect((await api().put(url)).status).toBe(401);
    expect((await api().put(url).set("Cookie", owner.cookie)).status).toBe(403);
  });

  it("200: soft-cancels (status Cancelled) and releases the stations", async () => {
    await seedStations();
    const owner = await makeUser();
    const admin = await makeAdmin();
    const created = await api()
      .post("/api/bookings")
      .set("Cookie", owner.cookie)
      .send(bookingPayload());
    const id = created.body.booking._id;

    const res = await api().put(`/api/admin/booking/${id}/cancel`).set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Admin forcefully cancelled the booking. Units are now free.",
    });
    expect((await models.Booking.findById(id)).status).toBe("Cancelled");
    const station = await models.Station.findOne({ stationId: "PC-01" }).lean();
    expect(station).toMatchObject({ status: "Available", assignedUser: null, activeBooking: null });
  });

  it.each(["Cancelled", "Completed"])("400: booking already %s", async (status) => {
    const owner = await makeUser();
    const admin = await makeAdmin();
    const booking = await makeBooking(owner, { status });

    const res = await api()
      .put(`/api/admin/booking/${booking._id}/cancel`)
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: `Booking is already ${status}` });
  });

  it("404: unknown id", async () => {
    const { cookie } = await makeAdmin();
    const res = await api().put(`/api/admin/booking/${newId()}/cancel`).set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Booking not found" });
  });
});

describe("fallback and body parsing", () => {
  it("404: unknown route uses the error envelope", async () => {
    const res = await api().get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "API Endpoint Not Found!" });
  });

  it("404: the profile routes the frontend calls do not exist (API_CONTRACT M-02)", async () => {
    const { cookie } = await makeUser();
    const put = await api().put("/api/users/profile").set("Cookie", cookie).send({ username: "x" });
    const del = await api().delete("/api/users/profile").set("Cookie", cookie);
    expect(put.status).toBe(404);
    expect(del.status).toBe(404);
  });

  it("413: JSON body over 100 kB is rejected with the error envelope", async () => {
    const res = await api()
      .post("/api/messages")
      .send({ name: "Big", email: "big@example.test", message: "x".repeat(150 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(await models.Message.countDocuments()).toBe(0);
  });

  it("400: malformed JSON uses the error envelope and no stack trace", async () => {
    const res = await api()
      .post("/api/messages")
      .set("Content-Type", "application/json")
      .send('{"name": ');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/\bat .+\.js:\d+/);
  });

  it("stores HTML/script strings verbatim and serves them only as JSON", async () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    await api()
      .post("/api/messages")
      .send({ name: payload, email: "x@example.test", subject: payload, message: payload });
    const { cookie } = await makeAdmin();

    const res = await api().get("/api/messages").set("Cookie", cookie);

    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.body.messages[0]).toMatchObject({ name: payload, subject: payload, message: payload });
  });
});
