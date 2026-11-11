// Contract: docs/API_CONTRACT.md §1.4 Tournaments.
const {
  api,
  makeUser,
  makeAdmin,
  makeTournament,
  players,
  newId,
  models,
} = require("../setup/helpers");

const TOURNAMENT_KEYS = [
  "__v",
  "_id",
  "createdAt",
  "description",
  "entryFee",
  "eventTime",
  "format",
  "game",
  "maxTeams",
  "prize",
  "registeredTeams",
  "rules",
  "status",
  "thumbnail",
  "title",
  "updatedAt",
];

const createBody = {
  title: "Summer Showdown",
  game: "CS2",
  description: "Bring your own mouse",
  eventTime: { start: "2030-06-01T10:00:00.000Z", end: "2030-06-01T18:00:00.000Z" },
  maxTeams: 8,
};

describe("GET /api/tournaments", () => {
  it("200: public, empty list", async () => {
    const res = await api().get("/api/tournaments");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, tournaments: [] });
  });

  it("200: sorted by start time with the documented shape and defaults", async () => {
    await makeTournament({
      title: "Later",
      eventTime: { start: "2030-05-01T10:00:00.000Z", end: "2030-05-01T12:00:00.000Z" },
    });
    await makeTournament({
      title: "Sooner",
      eventTime: { start: "2030-02-01T10:00:00.000Z", end: "2030-02-01T12:00:00.000Z" },
    });

    const res = await api().get("/api/tournaments");

    expect(res.body.tournaments.map((t) => t.title)).toEqual(["Sooner", "Later"]);
    expect(Object.keys(res.body.tournaments[0]).sort()).toEqual(TOURNAMENT_KEYS);
    expect(res.body.tournaments[0]).toMatchObject({
      prize: "TBD",
      entryFee: "Free",
      format: "5v5 Standard",
      thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e",
      status: "Upcoming",
      registeredTeams: [],
      maxTeams: 4,
    });
  });
});

describe("GET /api/tournaments/:tournamentId", () => {
  it("200: public", async () => {
    const t = await makeTournament();
    const res = await api().get(`/api/tournaments/${t._id}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["success", "tournament"]);
    expect(Object.keys(res.body.tournament).sort()).toEqual(TOURNAMENT_KEYS);
    expect(res.body.tournament.title).toBe("Winter Clash");
  });

  it("404: unknown id", async () => {
    const res = await api().get(`/api/tournaments/${newId()}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Tournament not found" });
  });

  it("400: malformed id (SEC-21)", async () => {
    const res = await api().get("/api/tournaments/not-an-id");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Invalid id." });
  });
});

describe("POST /api/tournaments", () => {
  it("401: without a cookie", async () => {
    expect((await api().post("/api/tournaments").send(createBody)).status).toBe(401);
  });

  it("403: normal user", async () => {
    const { cookie } = await makeUser();
    const res = await api().post("/api/tournaments").set("Cookie", cookie).send(createBody);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message: "Unauthorized. Admin Access Required.",
    });
  });

  it("201: admin creates a tournament", async () => {
    const { cookie } = await makeAdmin();
    const res = await api().post("/api/tournaments").set("Cookie", cookie).send(createBody);

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(["success", "tournament"]);
    expect(res.body.tournament).toMatchObject({ ...createBody, status: "Upcoming" });
  });

  it("201: maxTeams sent as a string (as the frontend does after editing) is cast", async () => {
    const { cookie } = await makeAdmin();
    const res = await api()
      .post("/api/tournaments")
      .set("Cookie", cookie)
      .send({ ...createBody, maxTeams: "12" });

    expect(res.status).toBe(201);
    expect(res.body.tournament.maxTeams).toBe(12);
  });

  it("400: missing title (SEC-21)", async () => {
    const { cookie } = await makeAdmin();
    const { title, ...body } = createBody;
    const res = await api().post("/api/tournaments").set("Cookie", cookie).send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Title is required" });
    expect(await models.Tournament.countDocuments()).toBe(0);
  });
});

describe("PUT /api/tournaments/:tournamentId", () => {
  it("401 / 403: needs an admin", async () => {
    const t = await makeTournament();
    const { cookie } = await makeUser();
    expect((await api().put(`/api/tournaments/${t._id}`).send({ title: "x" })).status).toBe(401);
    expect(
      (await api().put(`/api/tournaments/${t._id}`).set("Cookie", cookie).send({ title: "x" }))
        .status,
    ).toBe(403);
  });

  it("404: unknown id", async () => {
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/tournaments/${newId()}`)
      .set("Cookie", cookie)
      .send({ title: "x" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Tournament not found" });
  });

  it("200: admin updates; the UI-only fields the frontend also sends are ignored", async () => {
    const t = await makeTournament();
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/tournaments/${t._id}`)
      .set("Cookie", cookie)
      .send({
        title: "Winter Clash II",
        game: "Valorant",
        description: "Updated",
        maxTeams: 16,
        status: "Registration Open",
        eventTime: { start: "2030-03-02T10:00:00.000Z", end: "2030-03-02T18:00:00.000Z" },
        // exactly what TournamentDetails.jsx:111 adds
        selectedDate: "2030-03-02T00:00:00.000Z",
        startTime: "10:00",
        endTime: "18:00",
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Tournament updated successfully!");
    expect(res.body.tournament).toMatchObject({
      title: "Winter Clash II",
      maxTeams: 16,
      status: "Registration Open",
      prize: "TBD", // fields not sent keep their value
    });
    expect(res.body.tournament).not.toHaveProperty("selectedDate");
    expect(res.body.tournament).not.toHaveProperty("startTime");
  });
});

describe("DELETE /api/tournaments/:tournamentId", () => {
  it("401 / 403: needs an admin", async () => {
    const t = await makeTournament();
    const { cookie } = await makeUser();
    expect((await api().delete(`/api/tournaments/${t._id}`)).status).toBe(401);
    expect((await api().delete(`/api/tournaments/${t._id}`).set("Cookie", cookie)).status).toBe(403);
    expect(await models.Tournament.countDocuments()).toBe(1);
  });

  it("404: unknown id", async () => {
    const { cookie } = await makeAdmin();
    const res = await api().delete(`/api/tournaments/${newId()}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("200: admin deletes", async () => {
    const t = await makeTournament();
    const { cookie } = await makeAdmin();
    const res = await api().delete(`/api/tournaments/${t._id}`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Tournament deleted successfully. All time slots are now free!",
    });
    expect(await models.Tournament.countDocuments()).toBe(0);
  });
});

describe("POST /api/tournaments/:tournamentId/register", () => {
  const team = () => ({ teamName: "Night Owls", players: players(5) });

  it("401: without a cookie", async () => {
    const t = await makeTournament();
    expect((await api().post(`/api/tournaments/${t._id}/register`).send(team())).status).toBe(401);
  });

  it("404: unknown tournament", async () => {
    const { cookie } = await makeUser();
    const res = await api()
      .post(`/api/tournaments/${newId()}/register`)
      .set("Cookie", cookie)
      .send(team());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Tournament not found" });
  });

  it("201: registers the team with the caller as captain, status Pending", async () => {
    const t = await makeTournament();
    const { user, cookie } = await makeUser();
    const res = await api()
      .post(`/api/tournaments/${t._id}/register`)
      .set("Cookie", cookie)
      .send(team());

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Team registered successfully");
    expect(Object.keys(res.body.team).sort()).toEqual([
      "_id",
      "assignedPCs",
      "captain",
      "players",
      "status",
      "teamName",
    ]);
    expect(res.body.team).toMatchObject({
      teamName: "Night Owls",
      captain: user._id.toString(),
      status: "Pending",
      assignedPCs: [],
    });
    expect(res.body.team.players).toHaveLength(5);
    expect(Object.keys(res.body.team.players[0]).sort()).toEqual([
      "_id",
      "inGameId",
      "name",
      "phone",
    ]);
  });

  it("201: the per-player email the frontend sends is dropped (API_CONTRACT M-08)", async () => {
    const t = await makeTournament();
    const { cookie } = await makeUser();
    const withEmail = players(5).map((p, i) => ({ ...p, email: `p${i}@example.test` }));
    const res = await api()
      .post(`/api/tournaments/${t._id}/register`)
      .set("Cookie", cookie)
      .send({ teamName: "Night Owls", players: withEmail });

    expect(res.status).toBe(201);
    expect(res.body.team.players[0]).not.toHaveProperty("email");
  });

  it("201: six players are accepted", async () => {
    const t = await makeTournament();
    const { cookie } = await makeUser();
    const res = await api()
      .post(`/api/tournaments/${t._id}/register`)
      .set("Cookie", cookie)
      .send({ teamName: "Six Pack", players: players(6) });
    expect(res.status).toBe(201);
  });

  it.each([4, 7])("400: %i players (SEC-18)", async (n) => {
    const t = await makeTournament();
    const { cookie } = await makeUser();
    const res = await api()
      .post(`/api/tournaments/${t._id}/register`)
      .set("Cookie", cookie)
      .send({ teamName: "Wrong Size", players: players(n) });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "A team must have exactly 5 or 6 players",
    });
  });

  it("400: tournament is full", async () => {
    const t = await makeTournament({ maxTeams: 1 });
    const first = await makeUser();
    const second = await makeUser();
    await api().post(`/api/tournaments/${t._id}/register`).set("Cookie", first.cookie).send(team());

    const res = await api()
      .post(`/api/tournaments/${t._id}/register`)
      .set("Cookie", second.cookie)
      .send({ teamName: "Latecomers", players: players(5) });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Tournament is full" });
  });

  it("400: same captain or same team name twice", async () => {
    const t = await makeTournament();
    const first = await makeUser();
    const second = await makeUser();
    await api().post(`/api/tournaments/${t._id}/register`).set("Cookie", first.cookie).send(team());

    const sameCaptain = await api()
      .post(`/api/tournaments/${t._id}/register`)
      .set("Cookie", first.cookie)
      .send({ teamName: "Other Name", players: players(5) });
    const sameName = await api()
      .post(`/api/tournaments/${t._id}/register`)
      .set("Cookie", second.cookie)
      .send(team());

    for (const res of [sameCaptain, sameName]) {
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        message: "You or this team name are already registered",
      });
    }
  });
});

describe("PUT /api/tournaments/:tournamentId/team/:teamId/status", () => {
  async function tournamentWithTeam() {
    const captain = await makeUser();
    const t = await makeTournament({
      registeredTeams: [
        { teamName: "Night Owls", captain: captain.user._id, players: players(5) },
      ],
    });
    return { t, teamId: t.registeredTeams[0]._id.toString() };
  }

  it("401 / 403: needs an admin", async () => {
    const { t, teamId } = await tournamentWithTeam();
    const { cookie } = await makeUser();
    const url = `/api/tournaments/${t._id}/team/${teamId}/status`;
    expect((await api().put(url).send({ status: "Approved" })).status).toBe(401);
    expect((await api().put(url).set("Cookie", cookie).send({ status: "Approved" })).status).toBe(403);
  });

  it("404: unknown tournament or team", async () => {
    const { t } = await tournamentWithTeam();
    const { cookie } = await makeAdmin();

    const noTournament = await api()
      .put(`/api/tournaments/${newId()}/team/${newId()}/status`)
      .set("Cookie", cookie)
      .send({ status: "Approved" });
    const noTeam = await api()
      .put(`/api/tournaments/${t._id}/team/${newId()}/status`)
      .set("Cookie", cookie)
      .send({ status: "Approved" });

    expect(noTournament.status).toBe(404);
    expect(noTournament.body.message).toBe("Tournament not found");
    expect(noTeam.status).toBe(404);
    expect(noTeam.body.message).toBe("Squad not found in this tournament.");
  });

  it("200: Approved updates the team", async () => {
    const { t, teamId } = await tournamentWithTeam();
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/tournaments/${t._id}/team/${teamId}/status`)
      .set("Cookie", cookie)
      .send({ status: "Approved" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Squad Approved successfully!",
      action: "updated",
      team: { _id: teamId, status: "Approved" },
    });
  });

  it("200: Rejected removes the team from the roster", async () => {
    const { t, teamId } = await tournamentWithTeam();
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/tournaments/${t._id}/team/${teamId}/status`)
      .set("Cookie", cookie)
      .send({ status: "Rejected" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Squad rejected and removed from roster.",
      action: "deleted",
    });
    expect((await models.Tournament.findById(t._id)).registeredTeams).toHaveLength(0);
  });

  it("400: unknown status value (SEC-21)", async () => {
    const { t, teamId } = await tournamentWithTeam();
    const { cookie } = await makeAdmin();
    const res = await api()
      .put(`/api/tournaments/${t._id}/team/${teamId}/status`)
      .set("Cookie", cookie)
      .send({ status: "Banned" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Invalid team status" });
  });
});
