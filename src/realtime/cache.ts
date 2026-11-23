// In-process chat state. Right for ONE Render instance; moving to several
// instances means replacing this file with Redis (see docs/AUDIT.md / plan):
// recent messages and presence in Redis, and @socket.io/redis-adapter.
import type { ChatMessageDTO, ChatRoomDTO, PresencePayload, PresenceUser } from "../types/chat";

export const RECENT_LIMIT = 50;
export const ROOMS_TTL_MS = 5 * 60 * 1000;

// ── Recent messages: last RECENT_LIMIT per room, oldest first ───────────
const recent = new Map<string, ChatMessageDTO[]>();
// Bumped on every change, so a load that raced a write is not cached.
const versions = new Map<string, number>();
const bump = (roomId: string) => versions.set(roomId, (versions.get(roomId) ?? 0) + 1);

export async function recentMessages(
  roomId: string,
  load: () => Promise<ChatMessageDTO[]>,
): Promise<ChatMessageDTO[]> {
  const cached = recent.get(roomId);
  if (cached) return [...cached];
  const version = versions.get(roomId) ?? 0;
  const loaded = await load();
  if ((versions.get(roomId) ?? 0) === version) recent.set(roomId, loaded.slice(-RECENT_LIMIT));
  return loaded.slice(-RECENT_LIMIT);
}

export function appendRecent(message: ChatMessageDTO): void {
  bump(message.room);
  const list = recent.get(message.room);
  if (!list) return; // not loaded yet: the next load reads it from the database
  list.push(message);
  if (list.length > RECENT_LIMIT) list.splice(0, list.length - RECENT_LIMIT);
}

export function removeRecent(roomId: string, messageId: string): void {
  bump(roomId);
  // Dropping the buffer is simpler than back-filling the gap from the database.
  if (recent.get(roomId)?.some((m) => m._id === messageId)) recent.delete(roomId);
}

// ── Room list ───────────────────────────────────────────────────────────
let rooms: { list: ChatRoomDTO[]; expires: number } | null = null;

export async function cachedRooms(load: () => Promise<ChatRoomDTO[]>): Promise<ChatRoomDTO[]> {
  if (rooms && rooms.expires > Date.now()) return rooms.list;
  const list = await load();
  rooms = { list, expires: Date.now() + ROOMS_TTL_MS };
  return list;
}

export const invalidateRooms = (): void => {
  rooms = null;
};

// ── Presence: room → user → number of that user's sockets in the room ──
const presence = new Map<string, Map<string, { username: string; sockets: number }>>();

export function addPresence(roomId: string, user: PresenceUser): void {
  const members = presence.get(roomId) ?? new Map<string, { username: string; sockets: number }>();
  const entry = members.get(user._id);
  members.set(user._id, { username: user.username, sockets: (entry?.sockets ?? 0) + 1 });
  presence.set(roomId, members);
}

export function removePresence(roomId: string, userId: string): void {
  const members = presence.get(roomId);
  const entry = members?.get(userId);
  if (!members || !entry) return;
  if (entry.sockets > 1) entry.sockets -= 1;
  else members.delete(userId);
  if (members.size === 0) presence.delete(roomId);
}

const PRESENCE_LIST_LIMIT = 100;

export function presenceOf(roomId: string): PresencePayload {
  const members = presence.get(roomId) ?? new Map<string, { username: string; sockets: number }>();
  const users = [...members]
    .slice(0, PRESENCE_LIST_LIMIT)
    .map(([_id, { username }]) => ({ _id, username }));
  return { roomId, count: members.size, users };
}

// ── Send rate limit: token bucket per user (5 msgs / 5 s, burst 10) ────
export const BUCKET_CAPACITY = 10;
const REFILL_PER_MS = 1 / 1000;
const buckets = new Map<string, { tokens: number; updated: number }>();

export function takeToken(userId: string, now = Date.now()): boolean {
  const bucket = buckets.get(userId) ?? { tokens: BUCKET_CAPACITY, updated: now };
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + (now - bucket.updated) * REFILL_PER_MS);
  bucket.updated = now;
  buckets.set(userId, bucket);
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// Tests only: every test starts with empty chat state.
export function resetChatState(): void {
  recent.clear();
  versions.clear();
  rooms = null;
  presence.clear();
  buckets.clear();
}
