import { Task } from "../models/Task.js";
import { Submission } from "../models/Submission.js";
import { User } from "../models/user.model.js"; 
import { getHandleFromLink, extractUsernameFromProfileUrl } from "../utils/platformChecker.js"; 

// --- HELPER: IST Date ---
const getISTDateString = () => {
  const date = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; 
  const istDate = new Date(date.getTime() + istOffset);
  return istDate.toISOString().split('T')[0];
};

export const getDailyTasks = async (req, res) => {
  try { 
    const { accountId } = req.query;
    const today = getISTDateString(); 

    const tasks = await Task.find({ batchDate: today, active: true }).lean();

    if (!tasks.length) {
      return res.status(200).json({ message: "No tasks available yet.", tasks: [] });
    }

    let submissionStatusMap = {}; 
    
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
        status: { $in: ["Pending", "Approved", "Rejected"] } 
      }).select("taskId status");
      
      submissions.forEach(sub => {
          submissionStatusMap[sub.taskId.toString()] = sub.status;
      });
    }

    const tasksWithStatus = tasks.map(task => ({
      ...task,
      status: submissionStatusMap[task._id.toString()] || null, 
      isCompleted: ["Pending", "Approved"].includes(submissionStatusMap[task._id.toString()])
    }));

    return res.status(200).json({ 
      tasks: tasksWithStatus,
      completedCount: Object.values(submissionStatusMap).filter(s => ["Pending", "Approved"].includes(s)).length,
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

    // --- 1. DUPLICATE LINK CHECK ---
    // Check if this link was used in ANY other task (excluding current task if user is retrying)
    const linkAlreadyUsed = await Submission.findOne({
        userId: req.user._id,
        proofLink: proofLink,
        taskId: { $ne: taskId } // <--- allow re-using link if it's for the SAME task (e.g. resubmitting)
    });

    if (linkAlreadyUsed) {
        return res.status(400).json({ 
            message: "Duplicate Link Detected!",
            detail: "You have already used this video link for another task. Please upload a new video."
        });
    }

    // --- 2. EXISTING SUBMISSION CHECK (BUG FIX #1) ---
    let existing = await Submission.findOne({
        userId: req.user._id,
        taskId: taskId,
        linkedAccountId: accountId 
    });

    // If it exists AND is NOT Rejected, block it. 
    // (We ALLOW if it is 'Rejected' so user can fix it)
    if (existing && existing.status !== "Rejected") {
        return res.status(400).json({ message: "Task already submitted or approved." });
    }

    // --- 3. ACCOUNT VERIFICATION ---
    const user = await User.findById(req.user._id);
    const linkedAccount = user.linkedAccounts.id(accountId);
    
    if (!linkedAccount) return res.status(403).json({ message: "Invalid account selected." });

    const registeredHandle = linkedAccount.username || extractUsernameFromProfileUrl(linkedAccount.profileUrl, platform);
    
    // Call our new Smart Checker
    const checkResult = await getHandleFromLink(proofLink, platform);
    const submittedHandle = checkResult.handle;

    console.log(`[Verify] ${platform} | Registered: ${registeredHandle} | Found: ${submittedHandle} | Status: ${checkResult.status}`);

    // BUG FIX #6: Handle 404 vs Network Error
    if (checkResult.status === 404) {
         return res.status(400).json({ 
            message: "Invalid Video Link", 
            detail: "The link you submitted appears to be broken or private. Please check it." 
        });
    }

    if (submittedHandle && registeredHandle) {
        if (registeredHandle.toLowerCase() !== submittedHandle.toLowerCase()) {
             return res.status(400).json({ 
                message: "Ownership Mismatch!", 
                detail: `Video owner: @${submittedHandle} | Your account: @${registeredHandle}`
            });
        }
    } else {
        // If status was NOT 404, but we still didn't get a handle (e.g. 403 Blocked, or 200 but parsing failed)
        // We ALLOW it for Manual Review.
        console.log("Auto-verification skipped. Proceeding to manual review.");
    }

    // --- 4. SAVE (UPDATE OR CREATE) ---
    
    if (existing) {
        // BUG FIX #1: Update the Rejected submission
        existing.proofLink = proofLink;
        existing.status = "Pending";
        existing.adminComment = null; // Remove old rejection comment
        await existing.save();
        return res.status(200).json({ message: "Task resubmitted successfully!", submission: existing });
    } else {
        // Create New
        const newSubmission = await Submission.create({
            userId: req.user._id,
            taskId,
            linkedAccountId: accountId,
            platform,
            proofLink,
            status: "Pending"
        });
        return res.status(201).json({ message: "Task submitted successfully!", submission: newSubmission });
    }

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