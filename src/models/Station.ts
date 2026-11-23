import { model, Schema, type HydratedDocument } from "mongoose";
import type { IStation } from "../types/domain";

const stationSchema = new Schema<IStation>(
  {
    stationId: {
      type: String,
      required: true,
      unique: true, // Example: "PC-01", "C-05"
    },
    type: {
      type: String,
      enum: ["PC", "Console"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Available", "Occupied", "Maintenance", "Offline"],
      default: "Available",
    },
    // Agar koi khel raha hai, toh kis user ko assigned hai
    assignedUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Konsi booking filhal is PC par chal rahi hai
    activeBooking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
  },
  { timestamps: true },
);

export const Station = model<IStation>("Station", stationSchema);
export type StationDocument = HydratedDocument<IStation>;
