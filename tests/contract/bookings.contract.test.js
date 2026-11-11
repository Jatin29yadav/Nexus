// Contract: docs/API_CONTRACT.md §1.3 Bookings. Locks CURRENT behaviour,
// including behaviour AUDIT.md lists as defects (those are also asserted the
// other way round, as expected-to-fail tests, in tests/security).
const {
  api,
  makeUser,
  makeAdmin,
  makeBooking,
  makeTournament,
  seedStations,
  bookingPayload,
  newId,
  models,
  WINDOW,
} = require("../setup/helpers");

const BOOKING_KEYS = [
  "__v",
  "_id",
  "bookingTime",
  "bookingType",
  "createdAt",
  "email",
  "membersCount",
  "membersName",
  "name",
  "phone",
  "stations",
  "status",
  "totalAmount",
  "updatedAt",
  "user",
];

describe("POST /api/bookings", () => {
  it("401: without a cookie", async () => {
    const res = await api().post("/api/bookings").send(bookingPayload());
    expect(res.status).toBe(401);
  });

  it("201: creates the booking with the documented shape", async () => {
    await seedStations();
    const { user, cookie } = await makeUser();
    const res = await api().post("/api/bookings").set("Cookie", cookie).send(bookingPayload());

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(["booking", "message", "success"]);
    expect(res.body.message).toBe("Deployment Confirmed!");
    expect(Object.keys(res.body.booking).sort()).toEqual(BOOKING_KEYS);
    expect(res.body.booking).toMatchObject({
      user: user._id.toString(),
      stations: ["PC-01", "PC-02"],
      name: "Alex Player",
      email: "alex@example.test",
      phone: "9123456780",
      bookingType: "PC",
      membersCount: 2,
      membersName: ["Alex Player"],
      bookingTime: WINDOW,
      totalAmount: 400,
      status: "Active",
    });
  });

  it("marks the booked stations Occupied and links user and booking", async () => {
    await seedStations();
    const { user, cookie } = await makeUser();
    const res = await api().post("/api/bookings").set("Cookie", cookie).send(bookingPayload());

    const stations = await models.Station.find().sort({ stationId: 1 }).lean();
    const byId = Object.fromEntries(stations.map((s) => [s.stationId, s]));
    expect(byId["PC-01"].status).toBe("Occupied");
    expect(byId["PC-01"].assignedUser.toString()).toBe(user._id.toString());
    expect(byId["PC-01"].activeBooking.toString()).toBe(res.body.booking._id);
    expect(byId["PC-02"].status).toBe("Occupied");
    expect(byId["PC-03"].status).toBe("Available");
  });

  it.each(["Upcoming", "Registration Open", "Live"])(
    "400: window overlaps a %s tournament",
    async (status) => {
      await makeTournament({
        title: "Clash Night",
        status,
        eventTime: { start: "2030-01-10T11:00:00.000Z", end: "2030-01-10T15:00:00.000Z" },
      });
      const { cookie } = await makeUser();
      const res = await api().post("/api/bookings").set("Cookie", cookie).send(bookingPayload());

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        message: "Cafe is reserved for 'Clash Night'.",
      });
      expect(await models.Booking.countDocuments()).toBe(0);
    },
  );

  it("201: a Completed tournament in the same window does not block", async () => {
    await makeTournament({
      status: "Completed",
      eventTime: { start: "2030-01-10T11:00:00.000Z", end: "2030-01-10T15:00:00.000Z" },
    });
    await seedStations();
    const { cookie } = await makeUser();
    const res = await api().post("/api/bookings").set("Cookie", cookie).send(bookingPayload());
    expect(res.status).toBe(201);
  });

  it("400: missing bookingTime (SEC-03)", async () => {
    const { cookie } = await makeUser();
    const { bookingTime, ...body } = bookingPayload();
    const res = await api().post("/api/bookings").set("Cookie", cookie).send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Booking time is required" });
  });

  it("400: invalid bookingType (SEC-03)", async () => {
    const { cookie } = await makeUser();
    const res = await api()
      .post("/api/bookings")
      .set("Cookie", cookie)
      .send(bookingPayload({ bookingType: "VR" }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Please select either PC or Console",
    });
  });

  it.each([
    ["end before start", { bookingTime: { start: WINDOW.end, end: WINDOW.start } }, "End time must be after start time"],
    ["no stations", { stations: [] }, "Select at least one station"],
    ["the same station twice", { stations: ["PC-01", "PC-01"] }, "A station was selected twice"],
    ["more stations than players", { membersCount: 1 }, "You cannot book more stations than players"],
    ["operator object as a station", { stations: [{ $ne: null }] }, "Invalid request."],
    ["non-string station", { stations: [42] }, "Invalid station id"],
    ["zero players", { membersCount: 0 }, "At least one player is required"],
  ])("400: %s (SEC-03)", async (_label, overrides, message) => {
    await seedStations();
    const { cookie } = await makeUser();
    const res = await api()
      .post("/api/bookings")
      .set("Cookie", cookie)
      .send(bookingPayload(overrides));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message });
    expect(await models.Booking.countDocuments()).toBe(0);
    expect(await models.Station.countDocuments({ status: "Occupied" })).toBe(0);
  });

  it("409: an unavailable station fails the whole booking and claims nothing (SEC-03)", async () => {
    await seedStations();
    await models.Station.updateOne({ stationId: "PC-02" }, { status: "Offline" });
    const { cookie } = await makeUser();
    const res = await api().post("/api/bookings").set("Cookie", cookie).send(bookingPayload());

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: "One or more selected stations are not available.",
    });
    expect(await models.Booking.countDocuments()).toBe(0);
    expect((await models.Station.findOne({ stationId: "PC-01" })).status).toBe("Available");
  });

  it("the stored price is players x hours x 100, whatever the client sends (SEC-03)", async () => {
    await seedStations();
    const { cookie } = await makeUser();
    const res = await api()
      .post("/api/bookings")
      .set("Cookie", cookie)
      .send(bookingPayload({ membersCount: 3, totalAmount: 1 }));

    expect(res.body.booking.totalAmount).toBe(600); // 3 players x 2 h x 100
  });
});

describe("GET /api/bookings", () => {
  it("401: without a cookie", async () => {
    expect((await api().get("/api/bookings")).status).toBe(401);
  });

  it("200: empty list", async () => {
    const { cookie } = await makeUser();
    const res = await api().get("/api/bookings").set("Cookie", cookie);
    expect(res.body).toEqual({ success: true, bookings: [] });
  });

  it("200: newest first, user populated with _id, username, email", async () => {
    const owner = await makeUser();
    const first = await makeBooking(owner, { name: "First" });
    const second = await makeBooking(owner, { name: "Second" });
    await models.Booking.collection.updateOne(
      { _id: first._id },
      { $set: { createdAt: new Date("2020-01-01T00:00:00Z") } },
    );

    const res = await api().get("/api/bookings").set("Cookie", owner.cookie);

    expect(res.status).toBe(200);
    expect(res.body.bookings.map((b) => b._id)).toEqual([
      second._id.toString(),
      first._id.toString(),
    ]);
    expect(Object.keys(res.body.bookings[0]).sort()).toEqual(BOOKING_KEYS);
    expect(res.body.bookings[0].user).toEqual({
      _id: owner.user._id.toString(),
      username: owner.user.username,
      email: owner.user.email,
    });
  });
});

describe("GET /api/bookings/:bookingId", () => {
  it("401: without a cookie", async () => {
    expect((await api().get(`/api/bookings/${newId()}`)).status).toBe(401);
  });

  it("404: unknown id", async () => {
    const { cookie } = await makeUser();
    const res = await api().get(`/api/bookings/${newId()}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Not found" });
  });

  it("200: admin gets the booking with user populated (username only)", async () => {
    const owner = await makeUser();
    const admin = await makeAdmin();
    const booking = await makeBooking(owner);

    const res = await api().get(`/api/bookings/${booking._id}`).set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.booking).sort()).toEqual(BOOKING_KEYS);
    expect(res.body.booking.user).toEqual({
      _id: owner.user._id.toString(),
      username: owner.user.username,
    });
  });

  it("403: another user's booking", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const booking = await makeBooking(owner);

    const res = await api().get(`/api/bookings/${booking._id}`).set("Cookie", other.cookie);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: "Forbidden Access." });
  });

  it("400: malformed id (SEC-21)", async () => {
    const { cookie } = await makeUser();
    const res = await api().get("/api/bookings/not-an-id").set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Invalid id." });
  });
});

describe("PUT /api/bookings/:bookingId", () => {
  const changes = {
    phone: "9555555555",
    bookingTime: { start: "2030-01-11T10:00:00.000Z", end: "2030-01-11T13:00:00.000Z" },
    totalAmount: 600,
  };

  it("401: without a cookie", async () => {
    expect((await api().put(`/api/bookings/${newId()}`).send(changes)).status).toBe(401);
  });

  it("404: unknown id", async () => {
    const { cookie } = await makeUser();
    const res = await api().put(`/api/bookings/${newId()}`).set("Cookie", cookie).send(changes);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Not found" });
  });

  it("200: the amount is recomputed from the new time, not taken from the client (SEC-03)", async () => {
    const owner = await makeUser();
    const booking = await makeBooking(owner);

    const res = await api()
      .put(`/api/bookings/${booking._id}`)
      .set("Cookie", owner.cookie)
      .send({ ...changes, totalAmount: 1 });

    expect(res.body.booking.totalAmount).toBe(600); // 2 players x 3 h x 100
  });

  it("400: an update into a tournament window is refused (SEC-03)", async () => {
    await makeTournament({
      title: "Clash Night",
      eventTime: { start: "2030-01-11T11:00:00.000Z", end: "2030-01-11T15:00:00.000Z" },
    });
    const owner = await makeUser();
    const booking = await makeBooking(owner);

    const res = await api()
      .put(`/api/bookings/${booking._id}`)
      .set("Cookie", owner.cookie)
      .send(changes);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Cafe is reserved for 'Clash Night'.");
  });

  it("200: owner updates phone, time and amount", async () => {
    const owner = await makeUser();
    const booking = await makeBooking(owner);

    const res = await api()
      .put(`/api/bookings/${booking._id}`)
      .set("Cookie", owner.cookie)
      .send(changes);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Re-calibrated!");
    expect(res.body.booking).toMatchObject({ _id: booking._id.toString(), ...changes });
    expect(res.body.booking.name).toBe("Alex Player"); // untouched
  });

  it("200: admin can update any booking", async () => {
    const owner = await makeUser();
    const admin = await makeAdmin();
    const booking = await makeBooking(owner);

    const res = await api()
      .put(`/api/bookings/${booking._id}`)
      .set("Cookie", admin.cookie)
      .send({ phone: "9111111111" });

    expect(res.status).toBe(200);
    expect(res.body.booking.phone).toBe("9111111111");
  });

  it("403: another user cannot update it, and nothing changes", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const booking = await makeBooking(owner);

    const res = await api()
      .put(`/api/bookings/${booking._id}`)
      .set("Cookie", other.cookie)
      .send(changes);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: "Forbidden." });
    expect((await models.Booking.findById(booking._id)).phone).toBe("9123456780");
  });
});

describe("DELETE /api/bookings/:bookingId", () => {
  it("401: without a cookie", async () => {
    expect((await api().delete(`/api/bookings/${newId()}`)).status).toBe(401);
  });

  it("404: unknown id", async () => {
    const { cookie } = await makeUser();
    const res = await api().delete(`/api/bookings/${newId()}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Not found." });
  });

  it("200: owner cancels — booking is hard-deleted and stations are released", async () => {
    await seedStations();
    const owner = await makeUser();
    const created = await api()
      .post("/api/bookings")
      .set("Cookie", owner.cookie)
      .send(bookingPayload());

    const res = await api()
      .delete(`/api/bookings/${created.body.booking._id}`)
      .set("Cookie", owner.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Deployment Aborted." });
    expect(await models.Booking.countDocuments()).toBe(0);
    const station = await models.Station.findOne({ stationId: "PC-01" }).lean();
    expect(station).toMatchObject({ status: "Available", assignedUser: null, activeBooking: null });
  });

  it("200: admin can cancel any booking", async () => {
    const owner = await makeUser();
    const admin = await makeAdmin();
    const booking = await makeBooking(owner);

    const res = await api().delete(`/api/bookings/${booking._id}`).set("Cookie", admin.cookie);
    expect(res.status).toBe(200);
  });

  it("403: another user cannot cancel it, and it still exists", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const booking = await makeBooking(owner);

    const res = await api().delete(`/api/bookings/${booking._id}`).set("Cookie", other.cookie);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: "Unauthorized." });
    expect(await models.Booking.countDocuments()).toBe(1);
  });
});
