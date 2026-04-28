const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const setupSchema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ["PC", "VR"], required: true },
    isActive: { type: Boolean, default: true },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Setup", setupSchema);
