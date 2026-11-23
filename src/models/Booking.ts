import { model, Schema, type HydratedDocument } from "mongoose";
import type { IBooking } from "../types/domain";

const bookingSchema = new Schema<IBooking>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stations: [
      {
        type: String,
        required: true,
      },
    ],

    name: String,
    email: String,
    phone: String,
    bookingType: {
      type: String,
      enum: ["PC", "Console"],
      required: true,
    },
    membersCount: Number,
    membersName: [String],
    bookingTime: {
      start: Date,
      end: Date,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Active", "Completed", "Cancelled"],
      default: "Active",
    },
  },
  { timestamps: true },
);

export const Booking = model<IBooking>("Booking", bookingSchema);
export type BookingDocument = HydratedDocument<IBooking>;
