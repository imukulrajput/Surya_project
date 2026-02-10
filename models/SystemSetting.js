import mongoose from "mongoose";

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, 
  value: { type: mongoose.Schema.Types.Mixed, required: true }, 
  description: { type: String }
});

export const SystemSetting = mongoose.model("SystemSetting", settingSchema); 