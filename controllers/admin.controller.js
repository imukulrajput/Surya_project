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
    const globalDefault= rewardSetting ? Number(rewardSetting.value) : 2.5;

    const tasksWithDate = tasks.map(t => ({
      ...t,
      rewardAmount: t.rewardAmount ? Number(t.rewardAmount) : globalDefault, 
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
        // Default query: Only get tasks that are NOT deleted
        let query = { isDeleted: false }; 
        
        if (date) {
            query.batchDate = date;
        } 
        // If no date is provided, it fetches all non-deleted tasks for the admin panel

        const tasks = await Task.find(query).sort({ createdAt: -1 });
        return res.status(200).json({ tasks });
    } catch (error) {
        return res.status(500).json({ message: "Fetch failed" });
    }
};
// --- NEW: Delete a Task ---
export const deleteTask = async (req, res) => {
    try {
        // We set isDeleted to true AND active to false just to be safe
        await Task.findByIdAndUpdate(req.params.id, { 
            isDeleted: true, 
            active: false 
        });
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

      const reward = submission.taskId ? submission.taskId.rewardAmount : 2; 
   
      await User.findByIdAndUpdate(submission.userId, {
        $inc: { walletBalance: reward }
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
    const { status, page = 1, limit = 50, search, platform, date } = req.query;
    
       
    const queryStatus = status || "Pending";
    const skip = (parseInt(page) - 1) * parseInt(limit);

    
    let query = { status: queryStatus };

    
    if (platform) {
        query.platform = platform;
    }


    if (date) {
        const startDate = new Date(date);
        startDate.setUTCHours(0, 0, 0, 0);
        
        const endDate = new Date(date);
        endDate.setUTCHours(23, 59, 59, 999);

        query.createdAt = {
            $gte: startDate,
            $lte: endDate
        };
    }

    
    if (search) {
    
        const matchingUsers = await User.find({
            $or: [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        }).select('_id').lean();

        const userIds = matchingUsers.map(u => u._id);
        
        
        query.userId = { $in: userIds };
    }

   
    const submissions = await Submission.find(query)
      .populate("userId", "fullName email")
      .populate("taskId", "title rewardAmount")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalItems = await Submission.countDocuments(query);
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    return res.status(200).json({ 
        submissions,
        totalItems,
        totalPages,
        currentPage: parseInt(page)
    });
  } catch (error) {
    console.error("Filter Error:", error);
    return res.status(500).json({ message: "Fetch submissions failed" });
  }
};


export const getAllUsers = async (req, res) => {
    try {
        const { search } = req.query;
        
        // 1. Build Search Query
        let matchStage = { role: "user" };
        if (search) {
            matchStage = {
                ...matchStage,
                $or: [
                    { fullName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            };
        }

        // 2. Aggregation Pipeline (Join Users + PayoutMethods)
        const users = await User.aggregate([
            { $match: matchStage }, 
            {
                $lookup: {
                    from: "payoutmethods",       
                    localField: "_id",          
                    foreignField: "userId",      
                    as: "bankInfo"               
                }
            },
            {
                $project: {
                    // FIX: Use ONLY inclusion. 
                    // We simply DO NOT list password/tokens here, so they are automatically hidden.
                    
                    _id: 1, // Explicitly keep ID
                    fullName: 1,
                    email: 1,
                    walletBalance: 1,
                    linkedAccounts: 1,
                    role: 1,
                    createdAt: 1,
                    // Computed field
                    bankDetails: { $arrayElemAt: ["$bankInfo", 0] }
                }
            },
            { $sort: { createdAt: -1 } } 
        ]);

        return res.status(200).json({ users });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Fetch users failed" });
    }
};


export const toggleUserBan = async (req, res) => {
    try {
        const { userId, banned } = req.body; 
        await User.findByIdAndUpdate(userId, { 
            isBanned: banned,
            refreshToken: banned ? null : undefined 
        });
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
        const { key, value, applyToExisting } = req.body;
        
        await SystemSetting.findOneAndUpdate(
            { key },  
            { value },
            { upsert: true, new: true }
        );

     
        if (key === "reward_per_task" && applyToExisting) {
            await Task.updateMany(
                { isDeleted: false }, // Sirf active tasks ko update karenge
                { $set: { rewardAmount: Number(value) } }
            );
        }

        return res.status(200).json({ message: "Setting updated successfully" });
    } catch (error) {
        console.error("Settings Update Error:", error);
        return res.status(500).json({ message: "Update failed" });
    }
};

export const getSettings = async (req, res) => {
    try {
       
        const rewardSetting = await SystemSetting.findOne({ key: "reward_per_task" });
        const announcementSetting = await SystemSetting.findOne({ key: "global_announcement" });

        return res.status(200).json({
            reward: rewardSetting ? Number(rewardSetting.value) : 2.5,
            announcement: announcementSetting ? announcementSetting.value : { message: "", isActive: false }
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch settings" });
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

// --- NEW: Bulk Decide Submissions ---
export const bulkDecideSubmissions = async (req, res) => {
  try {
    const { submissionIds, decision, adminComment } = req.body;
    
    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
        return res.status(400).json({ message: "No submissions selected" });
    }

    if (decision === "Approved") {
      // 1. Fetch ONLY the necessary data and use .lean() to save massive amounts of RAM
      const submissions = await Submission.find({ 
          _id: { $in: submissionIds }, 
          status: "Pending" 
      })
      .populate("taskId", "rewardAmount") // Only fetch rewardAmount
      .lean(); // Returns plain JSON objects instead of heavy Mongoose documents

      if (submissions.length === 0) {
          return res.status(400).json({ message: "No valid pending submissions found" });
      }

      // 2. Mark all submissions as Approved in ONE fast database call
      await Submission.updateMany(
          { _id: { $in: submissionIds }, status: "Pending" },
          { $set: { status: "Approved" } }
      );

      // 3. Group the rewards by User locally in memory
      const userRewards = {};
      for (const sub of submissions) {
          const reward = sub.taskId ? sub.taskId.rewardAmount : 2;
          const uId = sub.userId.toString();
          
          if (!userRewards[uId]) {
              userRewards[uId] = 0;
          }
          userRewards[uId] += reward;
      }

      // 4. Create an array of bulk operations for the User model
      const bulkUserOps = Object.keys(userRewards).map(userId => ({
          updateOne: {
              filter: { _id: userId },
              update: { $inc: { walletBalance: userRewards[userId] } }
          }
      }));

      // 5. Execute all user balance updates in ONE database call
      if (bulkUserOps.length > 0) {
          await User.bulkWrite(bulkUserOps);
      }

    } else {
      // Rejections are already perfectly optimized using updateMany!
      await Submission.updateMany(
          { _id: { $in: submissionIds }, status: "Pending" },
          { 
            $set: { 
                status: "Rejected", 
                adminComment: adminComment || "Bulk rejected by admin" 
            } 
          }
      );
    }

    return res.status(200).json({ message: `Successfully ${decision} ${submissionIds.length} tasks.` });
  } catch (error) {
    console.error("Bulk Action Error:", error);
    return res.status(500).json({ message: "Bulk action failed" });
  }
};

// --- NEW: Approve ALL Pending Tasks (With Filters) ---
export const approveAllPending = async (req, res) => {
  try {
    // 1. Grab filters from the request body
    const { search, platform, date } = req.body;

    // 2. Build the exact same query used in getPendingSubmissions
    let query = { status: "Pending" };

    if (platform) query.platform = platform;

    if (date) {
        const startDate = new Date(date);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setUTCHours(23, 59, 59, 999);
        query.createdAt = { $gte: startDate, $lte: endDate };
    }

    if (search) {
        const matchingUsers = await User.find({
            $or: [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        }).select('_id').lean();

        const userIds = matchingUsers.map(u => u._id);
        query.userId = { $in: userIds };
    }

    // 3. Fetch matching pending submissions
    const submissions = await Submission.find(query)
      .populate("taskId", "rewardAmount")
      .lean();

    if (submissions.length === 0) {
      return res.status(400).json({ message: "No pending tasks found matching these filters." });
    }

    // 4. Lock in the exact IDs we are processing
    const pendingIds = submissions.map(sub => sub._id);

    // 5. Group the rewards by User locally in memory
    const userRewards = {};
    for (const sub of submissions) {
      const reward = sub.taskId ? sub.taskId.rewardAmount : 2; // Default to 2 if missing
      const uId = sub.userId.toString();
      
      if (!userRewards[uId]) {
        userRewards[uId] = 0;
      }
      userRewards[uId] += reward;
    }

    // 6. Create an array of bulk operations for the User model
    const bulkUserOps = Object.keys(userRewards).map(userId => ({
      updateOne: {
        filter: { _id: userId },
        update: { $inc: { walletBalance: userRewards[userId] } }
      }
    }));

    // 7. Execute all user balance updates in ONE database call
    if (bulkUserOps.length > 0) {
      await User.bulkWrite(bulkUserOps);
    }

    // 8. Safely mark only the locked-in IDs as Approved
    await Submission.updateMany(
      { _id: { $in: pendingIds } },
      { $set: { status: "Approved" } }
    );

    return res.status(200).json({ message: `Successfully approved ${pendingIds.length} filtered tasks!` });
  } catch (error) {
    console.error("Approve All Error:", error);
    return res.status(500).json({ message: "Failed to approve tasks." });
  }
};