// Contract: docs/API_CONTRACT.md §1.8 Live chat (REST + Socket.IO /chat).
import { api, makeUser, makeAdmin, makeTournament, newId, type TestUser } from "../setup/helpers";
import {
  startRealtime,
  connectAs,
  disconnectAll,
  send,
  nextEvent,
  noEvent,
  type Harness,
} from "../setup/realtime";
import { ChatMessage } from "../../src/models/ChatMessage";
import { ChatRoom } from "../../src/models/ChatRoom";
import { User } from "../../src/models/User";
import type { ChatMessageDTO, ChatRoomDTO, PresencePayload } from "../../src/types/chat";

let harness: Harness;
beforeAll(async () => {
  harness = await startRealtime();
});
afterEach(() => disconnectAll());
afterAll(async () => {
  await harness.close();
});

const rooms = async (): Promise<ChatRoomDTO[]> => (await api().get("/api/chat/rooms")).body.rooms;
const roomId = async (slug: string): Promise<string> => {
  const room = (await rooms()).find((r) => r.slug === slug);
  if (!room) throw new Error(`no room ${slug}`);
  return room._id;
};

let seq = 0;
const say = (text: string, room: string) => ({ roomId: room, text, clientId: `c${++seq}` });

async function storeMessages(room: string, author: TestUser, count: number) {
  const docs = [];
  for (let i = 1; i <= count; i++) {
    docs.push(
      await ChatMessage.create({
        room,
        user: author.user._id,
        username: author.user.username,
        text: `message ${i}`,
        clientId: `seed-${i}`,
      }),
    );
  }
  return docs;
}

describe("POST /api/chat/ticket", () => {
  it("401: needs a session", async () => {
    expect((await api().post("/api/chat/ticket")).status).toBe(401);
  });

  it("200: returns a 60 s ticket, not cached", async () => {
    const { cookie } = await makeUser();
    const res = await api().post("/api/chat/ticket").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["expiresIn", "success", "ticket"]);
    expect(res.body.expiresIn).toBe(60);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("GET /api/chat/rooms", () => {
  it("200: public; the default rooms come first", async () => {
    const list = await rooms();
    expect(list.map((r) => [r.slug, r.type, r.readOnly])).toEqual([
      ["general", "lobby", false],
      ["announcements", "announcements", true],
    ]);
    expect(Object.keys(list[0]!).sort()).toEqual(["_id", "name", "readOnly", "slug", "tournament", "type"]);
  });

  it("lists one room per open tournament and none for finished ones", async () => {
    const open = await makeTournament({ title: "Open Cup" });
    await makeTournament({ title: "Old Cup", status: "Completed" });
    const list = await rooms();
    expect(list.map((r) => r.name)).toEqual(["General", "Announcements", "Open Cup"]);
    expect(list[2]).toMatchObject({ type: "tournament", tournament: open._id.toString() });
  });

  it("a tournament created through the API shows up at once (cache invalidated)", async () => {
    await rooms(); // warm the cache
    const { cookie } = await makeAdmin();
    await api()
      .post("/api/tournaments")
      .set("Cookie", cookie)
      .send({
        title: "Fresh Cup",
        game: "CS2",
        eventTime: { start: "2030-06-01T10:00:00.000Z", end: "2030-06-01T18:00:00.000Z" },
        maxTeams: 8,
      });
    expect((await rooms()).map((r) => r.name)).toContain("Fresh Cup");
  });

  it("is idempotent: repeated loads create no duplicate rooms", async () => {
    await rooms();
    const { cookie } = await makeAdmin();
    await api().post("/api/tournaments").set("Cookie", cookie).send({
      title: "X",
      game: "CS2",
      eventTime: { start: "2030-06-01T10:00:00.000Z", end: "2030-06-01T18:00:00.000Z" },
      maxTeams: 8,
    });
    await rooms();
    expect(await ChatRoom.countDocuments({ slug: "general" })).toBe(1);
  });
});

describe("GET /api/chat/rooms/:roomId/messages", () => {
  it("401 anonymous, 400 bad id, 404 unknown room", async () => {
    const { cookie } = await makeUser();
    const general = await roomId("general");
    expect((await api().get(`/api/chat/rooms/${general}/messages`)).status).toBe(401);
    expect((await api().get("/api/chat/rooms/nope/messages").set("Cookie", cookie)).status).toBe(400);
    const res = await api().get(`/api/chat/rooms/${newId()}/messages`).set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Room not found." });
  });

  it("200: pages newest-first by cursor, each page oldest first", async () => {
    const user = await makeUser();
    const general = await roomId("general");
    const docs = await storeMessages(general, user, 5);

    const first = await api().get(`/api/chat/rooms/${general}/messages?limit=2`).set("Cookie", user.cookie);
    expect(first.status).toBe(200);
    expect(first.body.messages.map((m: ChatMessageDTO) => m.text)).toEqual(["message 4", "message 5"]);
    expect(first.body.hasMore).toBe(true);
    expect(Object.keys(first.body.messages[0]).sort()).toEqual([
      "_id", "createdAt", "room", "text", "user", "username",
    ]);

    const before = docs[3]!._id.toString();
    const second = await api()
      .get(`/api/chat/rooms/${general}/messages?limit=10&before=${before}`)
      .set("Cookie", user.cookie);
    expect(second.body.messages.map((m: ChatMessageDTO) => m.text)).toEqual(["message 1", "message 2", "message 3"]);
    expect(second.body.hasMore).toBe(false);
  });

  it.each(["limit=0", "limit=101", "limit=abc", "before=xyz"])("400: %s", async (query) => {
    const { cookie } = await makeUser();
    const general = await roomId("general");
    const res = await api().get(`/api/chat/rooms/${general}/messages?${query}`).set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("DELETE /api/chat/messages/:messageId", () => {
  it("the author may delete within 5 minutes; deleted messages leave history", async () => {
    const author = await makeUser();
    const general = await roomId("general");
    const [message] = await storeMessages(general, author, 1);

    const res = await api().delete(`/api/chat/messages/${message!._id}`).set("Cookie", author.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Message deleted." });

    const stored = (await ChatMessage.findById(message!._id).lean())!;
    expect(stored.deletedAt).toBeInstanceOf(Date);
    expect(stored.deletedBy!.toString()).toBe(author.user._id.toString());

    const history = await api().get(`/api/chat/rooms/${general}/messages`).set("Cookie", author.cookie);
    expect(history.body.messages).toEqual([]);

    const again = await api().delete(`/api/chat/messages/${message!._id}`).set("Cookie", author.cookie);
    expect(again.status).toBe(404);
  });

  it("403: the author after 5 minutes, or another user", async () => {
    const author = await makeUser();
    const other = await makeUser();
    const general = await roomId("general");
    const [recent] = await storeMessages(general, author, 1);
    const old = await ChatMessage.create({
      room: general,
      user: author.user._id,
      username: author.user.username,
      text: "old",
      clientId: "old",
      createdAt: new Date(Date.now() - 6 * 60 * 1000),
    });

    expect((await api().delete(`/api/chat/messages/${old._id}`).set("Cookie", author.cookie)).status).toBe(403);
    expect((await api().delete(`/api/chat/messages/${recent!._id}`).set("Cookie", other.cookie)).status).toBe(403);
  });

  it("200: an admin may delete any message", async () => {
    const author = await makeUser();
    const admin = await makeAdmin();
    const general = await roomId("general");
    const old = await ChatMessage.create({
      room: general,
      user: author.user._id,
      username: author.user.username,
      text: "old",
      clientId: "old",
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    expect((await api().delete(`/api/chat/messages/${old._id}`).set("Cookie", admin.cookie)).status).toBe(200);
  });

  it("broadcasts message:deleted to the room", async () => {
    const author = await makeUser();
    const admin = await makeAdmin();
    const general = await roomId("general");
    const socket = await connectAs(harness, author);
    await send(socket, "room:join", { roomId: general });
    const sent = await send(socket, "message:send", say("hello", general));
    const id = (sent.chatMessage as ChatMessageDTO)._id;

    const deleted = nextEvent(socket, "message:deleted");
    await api().delete(`/api/chat/messages/${id}`).set("Cookie", admin.cookie);
    expect(await deleted).toEqual({ roomId: general, id });

    // The cached recent history no longer contains it either.
    const rejoin = await connectAs(harness, author);
    const joined = await send(rejoin, "room:join", { roomId: general });
    expect(joined.history).toEqual([]);
  });
});

describe("PUT /api/chat/users/:userId/mute", () => {
  it("401 / 403: admins only", async () => {
    const target = await makeUser();
    const url = `/api/chat/users/${target.user._id}/mute`;
    expect((await api().put(url).send({ minutes: 5 })).status).toBe(401);
    expect((await api().put(url).set("Cookie", target.cookie).send({ minutes: 5 })).status).toBe(403);
  });

  it.each([{ minutes: -1 }, { minutes: 10081 }, { minutes: 1.5 }, {}])("400: %j", async (body) => {
    const target = await makeUser();
    const { cookie } = await makeAdmin();
    const res = await api().put(`/api/chat/users/${target.user._id}/mute`).set("Cookie", cookie).send(body);
    expect(res.status).toBe(400);
  });

  it("404: unknown user", async () => {
    const { cookie } = await makeAdmin();
    expect((await api().put(`/api/chat/users/${newId()}/mute`).set("Cookie", cookie).send({ minutes: 5 })).status).toBe(404);
  });

  it("200: mutes, and 0 unmutes; a muted user cannot send", async () => {
    const target = await makeUser();
    const { cookie } = await makeAdmin();
    const url = `/api/chat/users/${target.user._id}/mute`;
    const general = await roomId("general");
    const socket = await connectAs(harness, target);
    await send(socket, "room:join", { roomId: general });

    const muted = await api().put(url).set("Cookie", cookie).send({ minutes: 10 });
    expect(muted.status).toBe(200);
    expect(muted.body.message).toBe("User muted.");
    expect(new Date(muted.body.mutedUntil).getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);

    const refused = await send(socket, "message:send", say("hi", general));
    expect(refused).toMatchObject({ success: false, message: "You are muted in chat." });

    const unmuted = await api().put(url).set("Cookie", cookie).send({ minutes: 0 });
    expect(unmuted.body).toEqual({ success: true, message: "User unmuted.", mutedUntil: null });
    expect((await send(socket, "message:send", say("hi", general))).success).toBe(true);
  });
});

describe("Socket.IO /chat", () => {
  it("room:join returns the room, recent history and presence", async () => {
    const user = await makeUser();
    const general = await roomId("general");
    await storeMessages(general, user, 3);
    const socket = await connectAs(harness, user);

    const res = await send(socket, "room:join", { roomId: general });
    expect(res.success).toBe(true);
    expect((res.room as ChatRoomDTO).slug).toBe("general");
    expect((res.history as ChatMessageDTO[]).map((m) => m.text)).toEqual(["message 1", "message 2", "message 3"]);
    expect(res.presence).toEqual({
      roomId: general,
      count: 1,
      users: [{ _id: user.user._id.toString(), username: user.user.username }],
    });
  });

  it("recent history keeps only the last 50 messages", async () => {
    const user = await makeUser();
    const general = await roomId("general");
    await storeMessages(general, user, 55);
    const socket = await connectAs(harness, user);
    const res = await send(socket, "room:join", { roomId: general });
    const history = res.history as ChatMessageDTO[];
    expect(history).toHaveLength(50);
    expect(history[0]!.text).toBe("message 6");
  });

  it("room:join fails for an unknown room", async () => {
    const socket = await connectAs(harness, await makeUser());
    expect(await send(socket, "room:join", { roomId: newId() })).toEqual({
      success: false,
      message: "Room not found.",
    });
  });

  it("message:send stores, acks and broadcasts to everyone in the room", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const general = await roomId("general");
    const a = await connectAs(harness, alice);
    const b = await connectAs(harness, bob);
    await send(a, "room:join", { roomId: general });
    await send(b, "room:join", { roomId: general });

    const received = nextEvent<ChatMessageDTO>(b, "message:new");
    const ack = await send(a, "message:send", say("  gg wp  ", general));

    expect(ack.success).toBe(true);
    expect(ack.duplicate).toBe(false);
    const message = ack.chatMessage as ChatMessageDTO;
    expect(message).toMatchObject({
      room: general,
      user: alice.user._id.toString(),
      username: alice.user.username,
      text: "gg wp",
    });
    expect(await received).toEqual(message);
    expect(await ChatMessage.countDocuments({ text: "gg wp" })).toBe(1);

    // A later joiner sees it in the cached history.
    const c = await connectAs(harness, await makeUser());
    const joined = await send(c, "room:join", { roomId: general });
    expect((joined.history as ChatMessageDTO[]).map((m) => m._id)).toEqual([message._id]);
  });

  it("messages stay in their room", async () => {
    const tournament = await makeTournament({ title: "Cup" });
    const general = await roomId("general");
    const cupRoom = (await rooms()).find((r) => r.tournament === tournament._id.toString())!._id;
    const a = await connectAs(harness, await makeUser());
    const b = await connectAs(harness, await makeUser());
    await send(a, "room:join", { roomId: general });
    await send(b, "room:join", { roomId: cupRoom });

    const quiet = noEvent(b, "message:new");
    await send(a, "message:send", say("only general", general));
    expect(await quiet).toBe(true);
  });

  it("resending the same clientId is acknowledged once and stored once", async () => {
    const socket = await connectAs(harness, await makeUser());
    const general = await roomId("general");
    await send(socket, "room:join", { roomId: general });
    const payload = { roomId: general, text: "once", clientId: "same-id" };

    const first = await send(socket, "message:send", payload);
    const second = await send(socket, "message:send", payload);
    expect(second).toMatchObject({ success: true, duplicate: true });
    expect((second.chatMessage as ChatMessageDTO)._id).toBe((first.chatMessage as ChatMessageDTO)._id);
    expect(await ChatMessage.countDocuments({ text: "once" })).toBe(1);
  });

  it("refuses to send before joining the room", async () => {
    const socket = await connectAs(harness, await makeUser());
    const general = await roomId("general");
    expect(await send(socket, "message:send", say("hi", general))).toEqual({
      success: false,
      message: "Join the room first.",
    });
  });

  it("room:leave stops delivery", async () => {
    const general = await roomId("general");
    const a = await connectAs(harness, await makeUser());
    const b = await connectAs(harness, await makeUser());
    await send(a, "room:join", { roomId: general });
    await send(b, "room:join", { roomId: general });
    expect(await send(b, "room:leave", { roomId: general })).toEqual({ success: true });

    const quiet = noEvent(b, "message:new");
    await send(a, "message:send", say("bye", general));
    expect(await quiet).toBe(true);
  });

  it("announcements: users are refused, admins may post", async () => {
    const announcements = await roomId("announcements");
    const user = await connectAs(harness, await makeUser());
    const admin = await connectAs(harness, await makeAdmin());
    await send(user, "room:join", { roomId: announcements });
    await send(admin, "room:join", { roomId: announcements });

    expect(await send(user, "message:send", say("hey", announcements))).toEqual({
      success: false,
      message: "Only admins can post in this room.",
    });
    expect((await send(admin, "message:send", say("Open at 10", announcements))).success).toBe(true);
  });

  it("presence is broadcast when someone joins and leaves", async () => {
    const general = await roomId("general");
    const alice = await makeUser();
    const a = await connectAs(harness, alice);
    await send(a, "room:join", { roomId: general });
    await nextEvent(a, "presence"); // alice's own join

    const b = await connectAs(harness, await makeUser());
    const joined = nextEvent<PresencePayload>(a, "presence");
    await send(b, "room:join", { roomId: general });
    expect((await joined).count).toBe(2);

    const left = nextEvent<PresencePayload>(a, "presence");
    b.disconnect();
    expect(await left).toMatchObject({ count: 1, users: [{ _id: alice.user._id.toString() }] });
  });

  it("typing reaches the others in the room, not the sender", async () => {
    const general = await roomId("general");
    const alice = await makeUser();
    const a = await connectAs(harness, alice);
    const b = await connectAs(harness, await makeUser());
    await send(a, "room:join", { roomId: general });
    await send(b, "room:join", { roomId: general });

    const seen = nextEvent(b, "typing");
    const self = noEvent(a, "typing");
    a.emit("typing", { roomId: general });
    expect(await seen).toEqual({ roomId: general, userId: alice.user._id.toString(), username: alice.user.username });
    expect(await self).toBe(true);
  });

  it("logout disconnects the user's live sockets", async () => {
    const user = await makeUser();
    const socket = await connectAs(harness, user);
    const gone = nextEvent(socket, "disconnect");
    await api().post("/api/users/logout").set("Cookie", user.cookie);
    expect(await gone).toBe("io server disconnect");
  });

  it("a user deleted after connecting cannot send", async () => {
    const user = await makeUser();
    const general = await roomId("general");
    const socket = await connectAs(harness, user);
    await send(socket, "room:join", { roomId: general });
    await User.deleteOne({ _id: user.user._id });
    expect(await send(socket, "message:send", say("hi", general))).toEqual({
      success: false,
      message: "Session expired. Please sign in again.",
    });
  });
});
