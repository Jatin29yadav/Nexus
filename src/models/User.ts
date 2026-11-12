import { model, Schema, type HydratedDocument, type Model, type Types } from "mongoose";
import bcrypt from "bcryptjs";
import type { IUser, IUserMethods } from "../types/domain";

// Hydrated users hold mongoose arrays (.pull(), .push() with change tracking).
type UserOverrides = {
  wishlist: Types.Array<string>;
  bookings: Types.Array<Types.ObjectId>;
};
type UserModel = Model<IUser, object, IUserMethods & UserOverrides>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },

    // 👇 NAYE FIELDS YAHAN ADD HUE HAIN 👇

    // 1. Role for Admin powers
    role: {
      type: String,
      enum: ["User", "Admin"],
      default: "User", // Naya banda hamesha User banega
    },

    // SEC-09: every auth token carries the version it was issued under. Logout
    // increments this, which invalidates all tokens issued before it.
    // Never returned by queries unless explicitly selected.
    tokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },

    // 2. Wishlist for storing favorite PCs (e.g., ["PC-05", "C-02"])
    wishlist: [
      {
        type: String,
      },
    ],

    // 3. User ki past/active bookings ki list (Profile dashboard ke liye)
    bookings: [
      {
        type: Schema.Types.ObjectId,
        ref: "Booking",
      },
    ],
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  const hash = await bcrypt.hash(this.password, 10);
  this.password = hash;
});

userSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  return await bcrypt.compare(password, this.password);
};

export const User = model<IUser, UserModel>("User", userSchema);
export type UserDocument = HydratedDocument<IUser, IUserMethods & UserOverrides>;
