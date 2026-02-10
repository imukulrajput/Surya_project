import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true }, 
  videoUrl: { type: String, required: true }, 
  caption: { type: String, required: true },
  rewardAmount: { type: Number, default: 2.5 }, 
  batchDate: { type: String, required: true, index: true }, 
  active: { type: Boolean, default: true }
}, { timestamps: true });

export const Task = mongoose.model("Task", taskSchema);