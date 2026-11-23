import { model, Schema, type HydratedDocument } from "mongoose";
import type { IChatMessage } from "../types/domain";

export const CHAT_MESSAGE_MAX_LENGTH = 500;

const chatMessageSchema = new Schema<IChatMessage>({
  room: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  text: { type: String, required: true, maxlength: CHAT_MESSAGE_MAX_LENGTH },
  clientId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
});

// History is paged newest-first by _id within a room.
chatMessageSchema.index({ room: 1, _id: -1 });
// A resend with the same clientId (after a reconnect) is not stored twice.
chatMessageSchema.index({ user: 1, clientId: 1 }, { unique: true });

export const ChatMessage = model<IChatMessage>("ChatMessage", chatMessageSchema);
export type ChatMessageDocument = HydratedDocument<IChatMessage>;
