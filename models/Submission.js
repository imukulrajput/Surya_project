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
  adminComment: { type: String }, // <--- This stores the reason 
}, { timestamps: true });

// --- PERFORMANCE INDEXES (Fix #6) ---
// 1. Speeds up "My History" and duplicate checks
submissionSchema.index({ userId: 1, taskId: 1 });
// 2. Speeds up "Daily Progress" checks (resets daily)
submissionSchema.index({ userId: 1, createdAt: -1 });
// 3. Speeds up Admin Dashboard "Get Pending" queries
submissionSchema.index({ status: 1 });

export const Submission = mongoose.model("Submission", submissionSchema);