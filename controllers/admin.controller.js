import { User } from "../models/user.model.js";
import { Task } from "../models/Task.js";
import { Submission } from "../models/Submission.js";
import { Support } from "../models/Support.js";
import { Withdrawal } from "../models/Withdrawal.js";
import { SystemSetting } from "../models/SystemSetting.js";

// --- HELPER: Get Current Date String (YYYY-MM-DD) in IST ---
const getISTDateString = () => {
  const date = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; 
  const istDate = new Date(date.getTime() + istOffset);
  return istDate.toISOString().split('T')[0];
};

// --- HELPER: Get Start of Day (00:00:00) IST in UTC format ---
const getISTStartOfDay = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - istOffset);
};

export const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: "user" });
    const pendingSubmissions = await Submission.countDocuments({ status: "Pending" });
    const pendingWithdrawals = await Withdrawal.countDocuments({ status: "Pending" });
    
    const walletStats = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$walletBalance" } } }
    ]);

    const startOfDayIST = getISTStartOfDay();
    const tasksToday = await Submission.countDocuments({ 
        status: "Approved", 
        updatedAt: { $gte: startOfDayIST } 
    });

    return res.status(200).json({
      stats: {
        totalUsers,
        pendingSubmissions,
        pendingWithdrawals,
        totalLiability: walletStats[0]?.total || 0,
        tasksCompletedToday: tasksToday
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Stats error" });
  }
};

export const createDailyBatch = async (req, res) => {
  try {
    const { tasks } = req.body; 
    const batchDate = getISTDateString(); 

    const rewardSetting = await SystemSetting.findOne({ key: "reward_per_task" });
    const rewardAmount = rewardSetting ? Number(rewardSetting.value) : 2.5;

    const tasksWithDate = tasks.map(t => ({
      ...t,
      rewardAmount, 
      batchDate,
      active: true
    }));

    await Task.insertMany(tasksWithDate);
    return res.status(201).json({ message: `Added ${tasks.length} active tasks.` });
  } catch (error) {
    return res.status(500).json({ message: "Upload failed" });
  }
};

export const getTasksByDate = async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};
        
        if (date) {
            query.batchDate = date;
        } else {
            query.active = true;
        }

        const tasks = await Task.find(query);
        return res.status(200).json({ tasks });
    } catch (error) {
        return res.status(500).json({ message: "Fetch failed" });
    }
};

// --- NEW: Delete a Task ---
export const deleteTask = async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        return res.status(200).json({ message: "Task deleted successfully" });
    } catch (error) {
        return res.status(500).json({ message: "Delete failed" });
    }
};

// --- NEW: Update a Task (Edit) ---
export const updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, videoUrl, caption, rewardAmount, active } = req.body;

        const updatedTask = await Task.findByIdAndUpdate(
            id,
            { 
                $set: { 
                    title, 
                    videoUrl, 
                    caption, 
                    rewardAmount,
                    active
                } 
            },
            { new: true } // Return the updated document
        );

        if (!updatedTask) {
            return res.status(404).json({ message: "Task not found" });
        }

        return res.status(200).json({ message: "Task updated successfully", task: updatedTask });
    } catch (error) {
        return res.status(500).json({ message: "Update failed" });
    }
};

export const decideSubmission = async (req, res) => {
  try {
    const { submissionId, decision, adminComment } = req.body;
    const submission = await Submission.findById(submissionId).populate("taskId");
    
    if (!submission || submission.status !== "Pending") {
        return res.status(400).json({ message: "Invalid submission" });
    }

    if (decision === "Approved") {
      submission.status = "Approved";
      await submission.save();
   
      await User.findByIdAndUpdate(submission.userId, {
        $inc: { walletBalance: submission.taskId.rewardAmount }
      });
    } else {
      submission.status = "Rejected";
      submission.adminComment = adminComment;
      await submission.save();
    }
    return res.status(200).json({ message: `Submission ${decision}` });
  } catch (error) {
    return res.status(500).json({ message: "Action failed" });
  }
};

export const getPendingSubmissions = async (req, res) => {
  try {
    const { status } = req.query;
    
    // Default to "Pending" if no status is sent
    const queryStatus = status || "Pending";

    const submissions = await Submission.find({ status: queryStatus })
      .populate("userId", "fullName email")
      .populate("taskId", "title rewardAmount")
      .sort({ updatedAt: -1 }); // Sort by most recently updated

    return res.status(200).json({ submissions });
  } catch (error) {
    return res.status(500).json({ message: "Fetch submissions failed" });
  }
};


export const getAllUsers = async (req, res) => {
    try {
        const { search } = req.query;
        let query = { role: "user" };
        if (search) {
            query = { 
                ...query, 
                $or: [
                    { fullName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ] 
            };
        }
        const users = await User.find(query).select("-password");
        return res.status(200).json({ users });
    } catch (error) {
        return res.status(500).json({ message: "Fetch users failed" });
    }
};

export const toggleUserBan = async (req, res) => {
    try {
        const { userId, banned } = req.body; 
        await User.findByIdAndUpdate(userId, { refreshToken: banned ? null : undefined });
        return res.status(200).json({ message: `User ${banned ? 'Banned' : 'Unbanned'}` });
    } catch (error) {
        return res.status(500).json({ message: "Action failed" });
    }
};

export const getWithdrawals = async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find().populate("userId", "fullName walletBalance").sort({ createdAt: -1 });
        return res.status(200).json({ withdrawals });
    } catch (error) {
        return res.status(500).json({ message: "Fetch failed" });
    }
};

export const processWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, transactionId, comment } = req.body; 

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
        return res.status(404).json({ message: "Request not found" });
    }

    if (withdrawal.status !== "Pending") {
      return res.status(400).json({ message: "This request is already processed." });
    }

    if (action === "approve") {
      withdrawal.status = "Processed";
      withdrawal.transactionId = transactionId || "N/A"; 
      await withdrawal.save();
    } else if (action === "reject") {
      withdrawal.status = "Rejected";
      withdrawal.adminComment = comment || "Rejected by Admin";
      await withdrawal.save();

      if (withdrawal.userId) {
          const user = await User.findById(withdrawal.userId);
          if (user) {
            user.walletBalance += withdrawal.amount;
            await user.save();
          }
      }
    } else {
        return res.status(400).json({ message: "Invalid action" });
    }

    return res.status(200).json({ message: `Request ${action}ed successfully!`, withdrawal });

  } catch (error) {
    console.error("Admin Process Error:", error); 
    return res.status(500).json({ message: "Processing failed", error: error.message });
  }
};

export const getSupportTickets = async (req, res) => {
    try {
        const tickets = await Support.find().sort({ createdAt: -1 });
        return res.status(200).json({ tickets });
    } catch (error) {
        return res.status(500).json({ message: "Fetch failed" });
    }
};

export const updateTicketStatus = async (req, res) => {
    try {
        const { ticketId, status } = req.body;
        await Support.findByIdAndUpdate(ticketId, { status });
        return res.status(200).json({ message: "Ticket updated" });
    } catch (error) {
        return res.status(500).json({ message: "Update failed" });
    }
};

export const updateSettings = async (req, res) => {
    try {
        const { key, value } = req.body;
        await SystemSetting.findOneAndUpdate(
            { key },
            { value },
            { upsert: true, new: true }
        );
        return res.status(200).json({ message: "Setting updated" });
    } catch (error) {
        return res.status(500).json({ message: "Update failed" });
    }
};

export const updateAnnouncement = async (req, res) => {
    try {
        const { message, isActive } = req.body;
        await SystemSetting.findOneAndUpdate(
            { key: "global_announcement" },
            { value: { message, isActive } },
            { upsert: true }
        );
        return res.status(200).json({ message: "Announcement updated" });
    } catch (error) {
        return res.status(500).json({ message: "Update failed" });
    }
};  

export const exportWithdrawals = async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ status: "Pending" }).populate("userId", "fullName");
        
        let csv = "User Name,Amount,Method,Details,Date\n";
        
        withdrawals.forEach(w => {
            csv += `${w.userId.fullName},${w.amount},${w.method},${w.details},${w.createdAt}\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment('payouts.csv');
        return res.send(csv);
    } catch (error) {
        return res.status(500).json({ message: "Export failed" });
    }
};