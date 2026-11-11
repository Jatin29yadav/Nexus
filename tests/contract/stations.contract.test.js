// Contract: docs/API_CONTRACT.md §1.2 Stations.
const { api, makeUser, makeBooking, seedStations, models, WINDOW } = require("../setup/helpers");

describe("GET /api/stations", () => {
  it("200: public, empty list when nothing is seeded", async () => {
    const res = await api().get("/api/stations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, stations: [] });
  });

  it("200: sorted by stationId with the documented shape", async () => {
    await seedStations(["PC-02", "C-01", "PC-01"]);
    const res = await api().get("/api/stations");

    expect(res.body.stations.map((s) => s.stationId)).toEqual(["C-01", "PC-01", "PC-02"]);
    expect(Object.keys(res.body.stations[0]).sort()).toEqual([
      "__v",
      "_id",
      "activeBooking",
      "assignedUser",
      "createdAt",
      "stationId",
      "status",
      "type",
      "updatedAt",
    ]);
    expect(res.body.stations[0]).toMatchObject({
      stationId: "C-01",
      type: "Console",
      status: "Available",
      assignedUser: null,
      activeBooking: null,
    });
  });

  it("200: an occupied station carries its booking's time window", async () => {
    await seedStations(["PC-01"]);
    const owner = await makeUser();
    const booking = await makeBooking(owner, { stations: ["PC-01"] });
    await models.Station.updateOne(
      { stationId: "PC-01" },
      { status: "Occupied", assignedUser: owner.user._id, activeBooking: booking._id },
    );

    const res = await api().get("/api/stations");

    expect(res.body.stations[0].status).toBe("Occupied");
    expect(res.body.stations[0].activeBooking).toEqual({
      _id: booking._id.toString(),
      bookingTime: WINDOW,
    });
  });
});
