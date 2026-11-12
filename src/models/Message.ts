import { model, Schema, type HydratedDocument } from "mongoose";
import type { IMessage } from "../types/domain";

const messageSchema = new Schema<IMessage>({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String }, // Optional field for contact sync
  subject: { type: String, default: "No Subject" },
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ["Unread", "Read"], // Frontend uses these
    default: "Unread",
  },
  createdAt: {
    type: Date,
    default: Date.now, // Removed () so it evaluates at creation, not instantly
  },
});

export const Message = model<IMessage>("Message", messageSchema);
export type MessageDocument = HydratedDocument<IMessage>;
