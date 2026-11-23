// Event handlers for one authenticated /chat socket. Every client → server
// payload is validated with Zod; every event with an ack answers with the
// REST envelope { success, message?, ...payload }.
import type { z } from "zod";
import { User } from "../models/User";
import { chatRoomEventSchema, chatSendSchema } from "../validations/zodSchemas";
import { findRoom, postMessage, recentForRoom } from "../services/chat.service";
import { addPresence, presenceOf, removePresence, takeToken } from "./cache";
import { userRoom, type ChatNamespace } from "./hub";
import type { ChatSocket } from "./auth";
import type { ApiResponse } from "../types/api";
import { messageOf } from "../utils/narrow";

const PRESENCE_DEBOUNCE_MS = 1000;
const TYPING_THROTTLE_MS = 2000;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

type Ack = (response: ApiResponse) => void;
const ackOf = (value: unknown): Ack =>
  typeof value === "function" ? (response) => value(response) : () => undefined;

const parse = <T extends z.ZodType>(schema: T, payload: unknown, ack: Ack): z.infer<T> | null => {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  ack({ success: false, message: result.error.issues[0]?.message || "Invalid request." });
  return null;
};

// One pending presence broadcast per room at a time.
const presenceTimers = new Map<string, NodeJS.Timeout>();
function schedulePresence(chat: ChatNamespace, roomId: string): void {
  if (presenceTimers.has(roomId)) return;
  const timer = setTimeout(() => {
    presenceTimers.delete(roomId);
    chat.to(roomId).emit("presence", presenceOf(roomId));
  }, PRESENCE_DEBOUNCE_MS);
  timer.unref();
  presenceTimers.set(roomId, timer);
}

export function clearPresenceTimers(): void {
  for (const timer of presenceTimers.values()) clearTimeout(timer);
  presenceTimers.clear();
}

const chatRoomsOf = (socket: ChatSocket): string[] => [...socket.rooms].filter((r) => OBJECT_ID.test(r));

export function registerHandlers(chat: ChatNamespace, socket: ChatSocket): void {
  const { user } = socket.data;
  const presenceUser = { _id: user.id, username: user.username };
  const lastTyping = new Map<string, number>();

  void socket.join(userRoom(user.id));

  const leave = (roomId: string) => {
    if (!socket.rooms.has(roomId)) return;
    void socket.leave(roomId);
    removePresence(roomId, user.id);
    lastTyping.delete(roomId);
    schedulePresence(chat, roomId);
  };

  socket.on("room:join", async (payload, rawAck) => {
    const ack = ackOf(rawAck);
    const data = parse(chatRoomEventSchema, payload, ack);
    if (!data) return;
    try {
      const room = await findRoom(data.roomId);
      if (!room) return ack({ success: false, message: "Room not found." });
      if (!socket.rooms.has(room._id)) {
        await socket.join(room._id);
        addPresence(room._id, presenceUser);
        schedulePresence(chat, room._id);
      }
      const history = await recentForRoom(room._id);
      ack({ success: true, room, history, presence: presenceOf(room._id) });
    } catch (error) {
      console.error("Chat join error:", messageOf(error));
      ack({ success: false, message: "Could not join the room." });
    }
  });

  socket.on("room:leave", (payload, rawAck) => {
    const ack = ackOf(rawAck);
    const data = parse(chatRoomEventSchema, payload, ack);
    if (!data) return;
    leave(data.roomId);
    ack({ success: true });
  });

  socket.on("message:send", async (payload, rawAck) => {
    const ack = ackOf(rawAck);
    const data = parse(chatSendSchema, payload, ack);
    if (!data) return;
    if (!socket.rooms.has(data.roomId)) {
      return ack({ success: false, message: "Join the room first." });
    }
    if (!takeToken(user.id)) {
      return ack({ success: false, message: "Slow down! You are sending messages too fast." });
    }
    try {
      const room = await findRoom(data.roomId);
      if (!room) return ack({ success: false, message: "Room not found." });
      if (room.readOnly && user.role !== "Admin") {
        return ack({ success: false, message: "Only admins can post in this room." });
      }

      // Fresh read: a mute or a logout elsewhere applies to the next message.
      const current = await User.findById(user.id).select("+chatMutedUntil +tokenVersion").lean();
      if (!current || (current.tokenVersion || 0) !== user.tokenVersion) {
        ack({ success: false, message: "Session expired. Please sign in again." });
        socket.disconnect(true);
        return;
      }
      if (current.chatMutedUntil && current.chatMutedUntil.getTime() > Date.now()) {
        return ack({
          success: false,
          message: "You are muted in chat.",
          mutedUntil: current.chatMutedUntil.toISOString(),
        });
      }

      const { message, duplicate } = await postMessage({
        roomId: room._id,
        userId: user.id,
        username: user.username,
        text: data.text,
        clientId: data.clientId,
      });
      if (!duplicate) chat.to(room._id).emit("message:new", message);
      ack({ success: true, chatMessage: message, duplicate });
    } catch (error) {
      console.error("Chat send error:", messageOf(error));
      ack({ success: false, message: "Message could not be sent." });
    }
  });

  socket.on("typing", (payload) => {
    const result = chatRoomEventSchema.safeParse(payload);
    if (!result.success || !socket.rooms.has(result.data.roomId)) return;
    const { roomId } = result.data;
    const now = Date.now();
    if (now - (lastTyping.get(roomId) ?? 0) < TYPING_THROTTLE_MS) return;
    lastTyping.set(roomId, now);
    socket.to(roomId).emit("typing", { roomId, userId: user.id, username: user.username });
  });

  // Rooms are still attached during "disconnecting", gone by "disconnect".
  socket.on("disconnecting", () => {
    for (const roomId of chatRoomsOf(socket)) {
      removePresence(roomId, user.id);
      schedulePresence(chat, roomId);
    }
  });
}
