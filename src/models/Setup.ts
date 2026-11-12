import { model, Schema } from "mongoose";
import type { ISetup } from "../types/domain";

const setupSchema = new Schema<ISetup>(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ["PC", "VR"], required: true },
    isActive: { type: Boolean, default: true },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const Setup = model<ISetup>("Setup", setupSchema);
