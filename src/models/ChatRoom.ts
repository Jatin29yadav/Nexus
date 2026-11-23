import { model, Schema, type HydratedDocument } from "mongoose";
import type { IChatRoom } from "../types/domain";

const chatRoomSchema = new Schema<IChatRoom>(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["lobby", "tournament", "announcements"],
      required: true,
    },
    tournament: { type: Schema.Types.ObjectId, ref: "Tournament", default: null },
    readOnly: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const ChatRoom = model<IChatRoom>("ChatRoom", chatRoomSchema);
export type ChatRoomDocument = HydratedDocument<IChatRoom>;
