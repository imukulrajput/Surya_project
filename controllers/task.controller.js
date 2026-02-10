import { Task } from "../models/Task.js";
import { Submission } from "../models/Submission.js";
import { User } from "../models/user.model.js"; 

export const getDailyTasks = async (req, res) => {
  try { 
    const { accountId } = req.query;
    const today = new Date().toISOString().split('T')[0];

    const tasks = await Task.find({ batchDate: today, active: true }).lean();

    if (!tasks.length) {
      return res.status(200).json({ message: "No tasks available yet.", tasks: [] });
    }

    let completedTaskIds = [];
    
  
    if (accountId) {
     
      const accountExists = req.user.linkedAccounts.find(
        acc => acc._id.toString() === accountId
      );

      if (!accountExists) {
        return res.status(403).json({ message: "Access denied. Not your account." });
      }

      const submissions = await Submission.find({ 
        userId: req.user._id, 
        linkedAccountId: accountId, 
        status: { $in: ["Pending", "Approved"] } 
      }).select("taskId");
      
      completedTaskIds = submissions.map(s => s.taskId.toString());
    }

    const tasksWithStatus = tasks.map(task => ({
      ...task,
      isCompleted: completedTaskIds.includes(task._id.toString())
    }));

    return res.status(200).json({ 
      tasks: tasksWithStatus,
      completedCount: completedTaskIds.length, 
      totalCount: tasks.length 
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error fetching tasks" });
  }
};

export const submitTask = async (req, res) => {
  try {
    const { taskId, accountId, proofLink, platform } = req.body;

    
    if (!proofLink || !accountId) return res.status(400).json({ message: "Missing data" });

 
    const user = await User.findById(req.user._id);
    const linkedAccount = user.linkedAccounts.id(accountId);
    
    if (!linkedAccount) return res.status(403).json({ message: "Invalid account selected." });


    const existing = await Submission.findOne({
        userId: req.user._id,
        taskId: taskId,
        linkedAccountId: accountId 
    });

    if (existing) {
        return res.status(400).json({ message: "You already completed this task on this account." });
    }

    const newSubmission = await Submission.create({
      userId: req.user._id,
      taskId,
      linkedAccountId: accountId,
      platform,
      proofLink,
      status: "Pending"
    });

    return res.status(201).json({ message: "Task submitted successfully!", submission: newSubmission });

  } catch (error) {
    console.error("Submission Error:", error);
   
    if (error.code === 11000) {
        return res.status(400).json({ message: "Task already submitted on this account." });
    }
    return res.status(500).json({ message: "Submission failed." });
  }
};


export const getTaskHistory = async (req, res) => {
    try {
      const history = await Submission.find({ userId: req.user._id })
        .populate("taskId", "title rewardAmount")
        .sort({ createdAt: -1 });
      return res.status(200).json({ history });
    } catch (error) {
      return res.status(500).json({ message: "Error fetching history" });
    }
};