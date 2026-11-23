// Live chat hardening: handshake auth, origin check, payload validation,
// flood control and frame size. Socket.IO on an ephemeral local port.
import jwt from "jsonwebtoken";
import { api, makeUser, signToken } from "../setup/helpers";
import {
  startRealtime,
  connectChat,
  connectAs,
  disconnectAll,
  ticketFor,
  send,
  nextEvent,
  type Harness,
} from "../setup/realtime";
import { ChatMessage } from "../../src/models/ChatMessage";
import { User } from "../../src/models/User";
import { BUCKET_CAPACITY } from "../../src/realtime/cache";
import { ORIGIN_REJECTED, TICKET_REJECTED } from "../../src/realtime/auth";
import type { ChatRoomDTO } from "../../src/types/chat";

let harness: Harness;
beforeAll(async () => {
  harness = await startRealtime();
});
afterEach(() => disconnectAll());
afterAll(async () => {
  await harness.close();
});

const general = async (): Promise<string> =>
  ((await api().get("/api/chat/rooms")).body.rooms as ChatRoomDTO[]).find((r) => r.slug === "general")!._id;

const secret = () => process.env.JWT_SECRET!;

describe("chat handshake", () => {
  it("refuses a connection without a ticket", async () => {
    await expect(connectChat(harness)).rejects.toThrow(TICKET_REJECTED);
  });

  it("refuses a session token used as a ticket", async () => {
    const { token } = await makeUser();
    await expect(connectChat(harness, { ticket: token })).rejects.toThrow(TICKET_REJECTED);
  });

  it("refuses an expired ticket", async () => {
    const { user } = await makeUser();
    const expired = jwt.sign({ userId: user._id, tv: 0, purpose: "chat", exp: Math.floor(Date.now() / 1000) - 10 }, secret());
    await expect(connectChat(harness, { ticket: expired })).rejects.toThrow(TICKET_REJECTED);
  });

  it("refuses a ticket signed with another secret or algorithm", async () => {
    const { user } = await makeUser();
    const forged = jwt.sign({ userId: user._id, tv: 0, purpose: "chat" }, "x".repeat(40));
    const none = jwt.sign({ userId: user._id, tv: 0, purpose: "chat" }, "", { algorithm: "none" });
    await expect(connectChat(harness, { ticket: forged })).rejects.toThrow(TICKET_REJECTED);
    await expect(connectChat(harness, { ticket: none })).rejects.toThrow(TICKET_REJECTED);
  });

  it("refuses a ticket issued before logout (tokenVersion revocation)", async () => {
    const user = await makeUser();
    const ticket = await ticketFor(user);
    await User.updateOne({ _id: user.user._id }, { $inc: { tokenVersion: 1 } });
    await expect(connectChat(harness, { ticket })).rejects.toThrow(TICKET_REJECTED);
  });

  it("refuses a ticket for a user that no longer exists", async () => {
    const user = await makeUser();
    const ticket = await ticketFor(user);
    await User.deleteOne({ _id: user.user._id });
    await expect(connectChat(harness, { ticket })).rejects.toThrow(TICKET_REJECTED);
  });

  it.each([{ ticket: 123 }, { ticket: { $ne: null } }, { ticket: ["a"] }])("refuses a non-string ticket %j", async (auth) => {
    await expect(connectChat(harness, auth)).rejects.toThrow(TICKET_REJECTED);
  });

  it("refuses a browser Origin that is not on the allow-list (CSWSH)", async () => {
    const ticket = await ticketFor(await makeUser());
    await expect(connectChat(harness, { ticket, origin: "https://evil.example" })).rejects.toThrow(ORIGIN_REJECTED);
  });

  it("the default namespace accepts no one", async () => {
    const ticket = await ticketFor(await makeUser());
    await expect(connectChat(harness, { ticket, namespace: "/" })).rejects.toThrow("Use the /chat namespace.");
  });
});

describe("a chat ticket is not a session", () => {
  it("is refused as the auth cookie", async () => {
    const ticket = await ticketFor(await makeUser());
    const res = await api().get("/api/users/profile").set("Cookie", `token=${ticket}`);
    expect(res.status).toBe(401);
  });

  it("a plain session token (no purpose) still works as the cookie", async () => {
    const { user } = await makeUser();
    const res = await api().get("/api/users/profile").set("Cookie", `token=${signToken(user._id)}`);
    expect(res.status).toBe(200);
  });
});

describe("chat payload validation", () => {
  it.each([
    ["no payload", undefined, undefined],
    ["bad room id", { roomId: "general" }, "Invalid id."],
    ["operator as room id", { roomId: { $gt: "" } }, "Invalid id."],
    ["extra key", { roomId: "a".repeat(24), $where: "1" }, undefined],
  ])("room:join refuses %s", async (_label, payload, message) => {
    const socket = await connectAs(harness, await makeUser());
    const res = await send(socket, "room:join", payload);
    expect(res.success).toBe(false);
    if (message) expect(res.message).toBe(message);
  });

  it.each([
    ["an empty message", "   ", "Message cannot be empty"],
    ["a 501-character message", "a".repeat(501), "Message must be at most 500 characters"],
    ["a non-string text", 42, "Message text is required"],
  ])("message:send refuses %s", async (_label, text, message) => {
    const socket = await connectAs(harness, await makeUser());
    const roomId = await general();
    await send(socket, "room:join", { roomId });
    expect(await send(socket, "message:send", { roomId, text, clientId: "x1" })).toEqual({ success: false, message });
    expect(await ChatMessage.countDocuments()).toBe(0);
  });

  it("message:send refuses a bad clientId", async () => {
    const socket = await connectAs(harness, await makeUser());
    const roomId = await general();
    await send(socket, "room:join", { roomId });
    const res = await send(socket, "message:send", { roomId, text: "hi", clientId: "has space" });
    expect(res).toMatchObject({ success: false });
  });

  it("text is stored as plain text, HTML untouched (the client renders it as text)", async () => {
    const socket = await connectAs(harness, await makeUser());
    const roomId = await general();
    await send(socket, "room:join", { roomId });
    const res = await send(socket, "message:send", { roomId, text: "<img src=x onerror=alert(1)>", clientId: "h1" });
    expect(res.success).toBe(true);
    expect((await ChatMessage.findOne().lean())!.text).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("chat flood control", () => {
  it(`allows a burst of ${BUCKET_CAPACITY}, then slows the sender down`, async () => {
    const socket = await connectAs(harness, await makeUser());
    const roomId = await general();
    await send(socket, "room:join", { roomId });
    for (let i = 0; i < BUCKET_CAPACITY; i++) {
      expect((await send(socket, "message:send", { roomId, text: `m${i}`, clientId: `b${i}` })).success).toBe(true);
    }
    expect(await send(socket, "message:send", { roomId, text: "one more", clientId: "b-x" })).toEqual({
      success: false,
      message: "Slow down! You are sending messages too fast.",
    });
  });

  it("the limit is per user across tabs", async () => {
    const user = await makeUser();
    const roomId = await general();
    const a = await connectAs(harness, user);
    const b = await connectAs(harness, user);
    await send(a, "room:join", { roomId });
    await send(b, "room:join", { roomId });
    for (let i = 0; i < BUCKET_CAPACITY; i++) await send(a, "message:send", { roomId, text: `m${i}`, clientId: `t${i}` });
    expect((await send(b, "message:send", { roomId, text: "tab 2", clientId: "t-x" })).success).toBe(false);
  });

  it("a frame over 4 kB closes the connection", async () => {
    const socket = await connectAs(harness, await makeUser());
    const closed = nextEvent(socket, "disconnect");
    socket.emit("message:send", { roomId: "a".repeat(24), text: "a".repeat(5000), clientId: "big" });
    expect(await closed).toBe("transport close");
  });
});
