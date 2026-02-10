import mongoose from "mongoose";

const payoutMethodSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  type: {
    type: String,
    enum: ["IMPS", "USDT"], 
    default: "IMPS"
  },
  details: {
    fullName: String,
    phone: String,
    bankName: String,
    accountNumber: String,
    ifsc: String,
    city: String,
    address: String
  },
  isDefault: { type: Boolean, default: true }
}, { timestamps: true });

export const PayoutMethod = mongoose.model("PayoutMethod", payoutMethodSchema);