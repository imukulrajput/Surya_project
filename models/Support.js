import mongoose from "mongoose";

const supportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, 
  email: { type: String, required: true }, 
  subject: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ["Open", "Closed"], default: "Open" }
}, { timestamps: true });

export const Support = mongoose.model("Support", supportSchema);