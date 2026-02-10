import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
  
  
  linkedAccountId: { type: String, required: true }, 
  platform: { type: String, required: true },
  
  proofLink: { type: String, required: true },
  status: { 
    type: String, 
    enum: ["Pending", "Approved", "Rejected"], 
    default: "Pending" 
  },
  adminComment: { type: String }, 
}, { timestamps: true });

submissionSchema.index({ taskId: 1, linkedAccountId: 1 }, { unique: true });

export const Submission = mongoose.model("Submission", submissionSchema);