// Contract: docs/API_CONTRACT.md §1.5 Messages.
const { api, makeUser, makeAdmin, makeMessage, newId, models } = require("../setup/helpers");

// Exactly what nexus-frontend/src/pages/Contact.jsx sends.
const body = {
  name: "Visitor",
  email: "visitor@example.test",
  subject: "Opening hours",
  message: "What time do you open on Sunday?",
};

describe("POST /api/messages", () => {
  it("201: public, stores the message as Unread", async () => {
    const res = await api().post("/api/messages").send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, message: "Transmission sent successfully!" });
    const saved = await models.Message.findOne().lean();
    expect(saved).toMatchObject({ ...body, status: "Unread" });
  });

  it("201: subject defaults to 'No Subject'; phone is optional", async () => {
    const { subject, ...withoutSubject } = body;
    await api().post("/api/messages").send({ ...withoutSubject, phone: "9000000000" });
    const saved = await models.Message.findOne().lean();
    expect(saved.subject).toBe("No Subject");
    expect(saved.phone).toBe("9000000000");
  });

  it.each(["name", "email", "message"])("400: %s missing", async (field) => {
    const { [field]: _omit, ...partial } = body;
    const res = await api().post("/api/messages").send(partial);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Please fill all the required fields.",
    });
  });
});

describe("GET /api/messages", () => {
  it("401 / 403: needs an admin", async () => {
    const { cookie } = await makeUser();
    expect((await api().get("/api/messages")).status).toBe(401);
    expect((await api().get("/api/messages").set("Cookie", cookie)).status).toBe(403);
  });

  it("200: newest first with the documented shape", async () => {
    await makeMessage({ subject: "Old", createdAt: new Date("2029-01-01T00:00:00Z") });
    await makeMessage({ subject: "New", createdAt: new Date("2029-06-01T00:00:00Z") });
    const { cookie } = await makeAdmin();

    const res = await api().get("/api/messages").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["messages", "success"]);
    expect(res.body.messages.map((m) => m.subject)).toEqual(["New", "Old"]);
    expect(Object.keys(res.body.messages[0]).sort()).toEqual([
      "__v",
      "_id",
      "createdAt",
      "email",
      "message",
      "name",
      "status",
      "subject",
    ]);
  });
});

describe("PUT /api/messages/:id/read", () => {
  it("401 / 403: needs an admin", async () => {
    const msg = await makeMessage();
    const { cookie } = await makeUser();
    expect((await api().put(`/api/messages/${msg._id}/read`)).status).toBe(401);
    expect((await api().put(`/api/messages/${msg._id}/read`).set("Cookie", cookie)).status).toBe(403);
  });

  it("200: marks it Read and returns it under `data`", async () => {
    const msg = await makeMessage();
    const { cookie } = await makeAdmin();
    const res = await api().put(`/api/messages/${msg._id}/read`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["data", "message", "success"]);
    expect(res.body.message).toBe("Marked as Read");
    expect(res.body.data).toMatchObject({ _id: msg._id.toString(), status: "Read" });
  });

  it("404: unknown id", async () => {
    const { cookie } = await makeAdmin();
    const res = await api().put(`/api/messages/${newId()}/read`).set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Transmission not found" });
  });
});

describe("DELETE /api/messages/:id", () => {
  it("401 / 403: needs an admin", async () => {
    const msg = await makeMessage();
    const { cookie } = await makeUser();
    expect((await api().delete(`/api/messages/${msg._id}`)).status).toBe(401);
    expect((await api().delete(`/api/messages/${msg._id}`).set("Cookie", cookie)).status).toBe(403);
    expect(await models.Message.countDocuments()).toBe(1);
  });

  it("200: deletes", async () => {
    const msg = await makeMessage();
    const { cookie } = await makeAdmin();
    const res = await api().delete(`/api/messages/${msg._id}`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Transmission deleted" });
    expect(await models.Message.countDocuments()).toBe(0);
  });

  it("404: unknown id", async () => {
    const { cookie } = await makeAdmin();
    const res = await api().delete(`/api/messages/${newId()}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Transmission not found" });
  });
});
