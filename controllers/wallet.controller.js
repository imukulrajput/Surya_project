import { User } from "../models/user.model.js";
import { Withdrawal } from "../models/Withdrawal.js";
import { PayoutMethod } from "../models/PayoutMethod.js";


export const linkPayoutMethod = async (req, res) => {
  try {
    const { details } = req.body; 

   
    let method = await PayoutMethod.findOne({ userId: req.user._id });

    if (method) {
      method.details = details;
      await method.save();
    } else {
      method = await PayoutMethod.create({
        userId: req.user._id,
        type: "IMPS",
        details
      });
    }

    return res.status(200).json({ message: "Account Linked Successfully!", method });
  } catch (error) {
    return res.status(500).json({ message: "Failed to link account" });
  }
};


export const getPayoutMethods = async (req, res) => {
  try {
    const methods = await PayoutMethod.find({ userId: req.user._id });
    return res.status(200).json({ methods });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching methods" });
  }
};


export const requestWithdrawal = async (req, res) => {
  try {
    const { amount, methodId } = req.body;
    const userId = req.user._id;

    if (amount < 50) return res.status(400).json({ message: "Minimum withdrawal is ₹50" });

  
    const user = await User.findById(userId);
    if (user.walletBalance < amount) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    const payoutMethod = await PayoutMethod.findById(methodId);
    if (!payoutMethod) return res.status(404).json({ message: "Link a bank account first" });

   
    const withdrawal = await Withdrawal.create({
      userId,
      amount,
      method: payoutMethod.type,
      details: payoutMethod.details,
      status: "Pending"
    });

   
    user.walletBalance -= amount;
    await user.save();

    return res.status(201).json({ message: "Withdrawal Requested!", withdrawal });

  } catch (error) {
    return res.status(500).json({ message: "Withdrawal failed", error: error.message });
  }
};


export const getWithdrawalHistory = async (req, res) => {
  try {
    const history = await Withdrawal.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({ history });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch history" });
  }
};   