import mongoose from "mongoose";

const withdrawalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 50
  },
  method: {
    type: String,
    required: true
  },
  details: {
    type: Object, 
    required: true
  },
  status: {
    type: String,
    enum: ["Pending", "Processed", "Rejected"],
    default: "Pending"
  },
 
  transactionId: {
    type: String, 
    default: null
  },
 
  adminComment: {
    type: String, 
    default: null
  }
}, { timestamps: true });

export const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);