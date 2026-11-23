// Live chat data access, shared by the REST controllers and the socket
// handlers. Messages are written to MongoDB first and broadcast second, so
// every id a client sees is real.
import mongoose, { Types } from "mongoose";
import { ChatRoom } from "../models/ChatRoom";
import { ChatMessage } from "../models/ChatMessage";
import { Tournament } from "../models/Tournament";
import type { IChatMessage, IChatRoom, TournamentStatus } from "../types/domain";
import type { ChatMessageDTO, ChatRoomDTO } from "../types/chat";
import { appendRecent, cachedRooms, recentMessages, removeRecent, RECENT_LIMIT } from "../realtime/cache";
import { broadcastDeleted } from "../realtime/hub";

type WithId<T> = T & { _id: Types.ObjectId };

export const toRoomDTO = (room: WithId<IChatRoom>): ChatRoomDTO => ({
  _id: room._id.toString(),
  slug: room.slug,
  name: room.name,
  type: room.type,
  tournament: room.tournament ? room.tournament.toString() : null,
  readOnly: room.readOnly,
});

export const toMessageDTO = (message: WithId<IChatMessage>): ChatMessageDTO => ({
  _id: message._id.toString(),
  room: message.room.toString(),
  user: message.user.toString(),
  username: message.username,
  text: message.text,
  createdAt: new Date(message.createdAt).toISOString(),
});

const DEFAULT_ROOMS: Array<Pick<IChatRoom, "slug" | "name" | "type" | "readOnly">> = [
  { slug: "general", name: "General", type: "lobby", readOnly: false },
  { slug: "announcements", name: "Announcements", type: "announcements", readOnly: true },
];

// Tournaments that still have a chat room in the list.
const OPEN_TOURNAMENTS: TournamentStatus[] = ["Upcoming", "Registration Open", "Live"];

// sanitizeFilter is on (app.ts, SEC-04): operators built here from validated
// values are marked trusted; user input never reaches them unwrapped.
const trusted = <T>(filter: T): T => mongoose.trusted(filter) as T;

// Idempotent. The name follows the tournament title; the rest is fixed at creation.
const upsertRoom = ({ name, ...fixed }: Omit<IChatRoom, "createdAt" | "updatedAt">) =>
  ChatRoom.updateOne({ slug: fixed.slug }, { $set: { name }, $setOnInsert: fixed }, { upsert: true });

const tournamentSlug = (tournamentId: Types.ObjectId): string => `tournament-${tournamentId.toString()}`;

// The default rooms plus one per open tournament, created on first sight.
async function loadRooms(): Promise<ChatRoomDTO[]> {
  const tournaments = await Tournament.find({ status: trusted({ $in: OPEN_TOURNAMENTS }) })
    .select("title")
    .lean();

  await Promise.all([
    ...DEFAULT_ROOMS.map((room) => upsertRoom({ ...room, tournament: null })),
    ...tournaments.map((t) =>
      upsertRoom({
        slug: tournamentSlug(t._id),
        name: t.title,
        type: "tournament",
        tournament: t._id,
        readOnly: false,
      }),
    ),
  ]);

  const slugs = [...DEFAULT_ROOMS.map((r) => r.slug), ...tournaments.map((t) => tournamentSlug(t._id))];
  const rooms = await ChatRoom.find({ slug: trusted({ $in: slugs }) }).lean();
  const order = (slug: string) => slugs.indexOf(slug);
  return rooms.sort((a, b) => order(a.slug) - order(b.slug)).map(toRoomDTO);
}

export const listRooms = (): Promise<ChatRoomDTO[]> => cachedRooms(loadRooms);

export async function findRoom(roomId: string): Promise<ChatRoomDTO | null> {
  const listed = (await listRooms()).find((room) => room._id === roomId);
  if (listed) return listed;
  // Rooms of finished tournaments are no longer listed but still exist.
  const room = await ChatRoom.findById(roomId).lean();
  return room ? toRoomDTO(room) : null;
}

const visible = (roomId: string) => ({ room: new Types.ObjectId(roomId), deletedAt: null });

/** The newest messages of a room, oldest first, from the in-process cache. */
export const recentForRoom = (roomId: string): Promise<ChatMessageDTO[]> =>
  recentMessages(roomId, async () => {
    const docs = await ChatMessage.find(visible(roomId)).sort({ _id: -1 }).limit(RECENT_LIMIT).lean();
    return docs.reverse().map(toMessageDTO);
  });

/** One page of older history, oldest first. `before` is a message id cursor. */
export async function historyPage(
  roomId: string,
  before: string | undefined,
  limit: number,
): Promise<{ messages: ChatMessageDTO[]; hasMore: boolean }> {
  const filter = before
    ? { ...visible(roomId), _id: trusted({ $lt: new Types.ObjectId(before) }) }
    : visible(roomId);
  const docs = await ChatMessage.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = docs.length > limit;
  return { messages: docs.slice(0, limit).reverse().map(toMessageDTO), hasMore };
}

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === 11000;

/**
 * Stores a message. A resend with a clientId this user already used returns
 * the stored message with `duplicate: true`, so it is not broadcast twice.
 */
export async function postMessage(input: {
  roomId: string;
  userId: string;
  username: string;
  text: string;
  clientId: string;
}): Promise<{ message: ChatMessageDTO; duplicate: boolean }> {
  try {
    const doc = await ChatMessage.create({
      room: input.roomId,
      user: input.userId,
      username: input.username,
      text: input.text,
      clientId: input.clientId,
    });
    const message = toMessageDTO(doc.toObject());
    appendRecent(message);
    return { message, duplicate: false };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const existing = await ChatMessage.findOne({ user: input.userId, clientId: input.clientId }).lean();
    if (!existing) throw error;
    return { message: toMessageDTO(existing), duplicate: true };
  }
}

export const AUTHOR_DELETE_WINDOW_MS = 5 * 60 * 1000;

export type DeleteResult = "deleted" | "not_found" | "forbidden";

/** Soft delete: admins always; the author within AUTHOR_DELETE_WINDOW_MS. */
export async function deleteMessage(
  messageId: string,
  actor: { id: string; isAdmin: boolean },
): Promise<DeleteResult> {
  const message = await ChatMessage.findOne({ _id: messageId, deletedAt: null });
  if (!message) return "not_found";

  const isAuthor = message.user.toString() === actor.id;
  const inWindow = Date.now() - message.createdAt.getTime() <= AUTHOR_DELETE_WINDOW_MS;
  if (!actor.isAdmin && !(isAuthor && inWindow)) return "forbidden";

  message.deletedAt = new Date();
  message.deletedBy = new Types.ObjectId(actor.id);
  await message.save();

  const roomId = message.room.toString();
  removeRecent(roomId, messageId);
  broadcastDeleted(roomId, messageId);
  return "deleted";
}
