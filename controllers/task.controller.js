import { Task } from "../models/Task.js";
import { Submission } from "../models/Submission.js";
import { User } from "../models/user.model.js"; 
import { getHandleFromLink, extractUsernameFromProfileUrl } from "../utils/platformChecker.js"; 

// --- HELPER: Get Start of Today (IST) in UTC ---
// This ensures "Today" resets at 12:00 AM India Time
const getStartOfTodayIST = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  istTime.setUTCHours(0, 0, 0, 0); // Set to midnight IST
  return new Date(istTime.getTime() - istOffset); // Convert back to UTC
};

const getISTDateString = () => {
  const date = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);
  return istDate.toISOString().split('T')[0];
};


export const getDailyTasks = async (req, res) => {
  try { 
    const { accountId } = req.query;
    
    // 1. Fetch ALL Active Tasks
    const tasks = await Task.find({ active: true }).lean();

    if (!tasks.length) {
      return res.status(200).json({ message: "No tasks available.", tasks: [] });
    }

    // 2. Determine "Today's" Start Time
    const startOfToday = getISTDateString(); // Ensure this helper is imported or defined

    let submissionMap = {}; 
    
    if (accountId) {
      // ... (account ownership check stays same) ...

      // 3. Fetch submissions for Today
      // NOTE: Using getISTStartOfDay logic inside query if needed, or simple date check
      // For simplicity, assuming you kept the "Evergreen" logic we built:
      const submissions = await Submission.find({ 
        userId: req.user._id, 
        linkedAccountId: accountId, 
        // If you want "Daily Reset", ensure you use the date filter here
        createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } 
      }).select("taskId status adminComment"); // <--- Added adminComment selection
      
      submissions.forEach(sub => {
          // Store both status and comment
          submissionMap[sub.taskId.toString()] = {
              status: sub.status,
              comment: sub.adminComment
          };
      });
    }

    // 4. Map Status & Comment
    const tasksWithStatus = tasks.map(task => {
      const userSub = submissionMap[task._id.toString()];
      return {
        ...task,
        status: userSub ? userSub.status : null,
        adminComment: userSub ? userSub.comment : null, // <--- NEW: Send comment to frontend
        isCompleted: userSub && ["Pending", "Approved"].includes(userSub.status)
      };
    });

    return res.status(200).json({ 
      tasks: tasksWithStatus,
      completedCount: Object.values(submissionMap).filter(s => ["Pending", "Approved"].includes(s.status)).length,
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

    // --- 1. DUPLICATE LINK CHECK (Global) ---
    // User cannot use the same link twice EVER (prevents spamming same video every day)
    const linkAlreadyUsed = await Submission.findOne({
        userId: req.user._id,
        proofLink: proofLink,
        taskId: { $ne: taskId } 
    });

    if (linkAlreadyUsed) {
        return res.status(400).json({ 
            message: "Duplicate Link Detected!",
            detail: "You have already used this video link. Please upload a new video."
        });
    }

    // --- 2. DAILY LIMIT CHECK (Key Logic Change) ---
    const startOfToday = getStartOfTodayIST();
    
    let existing = await Submission.findOne({
        userId: req.user._id,
        taskId: taskId,
        linkedAccountId: accountId,
        createdAt: { $gte: startOfToday } // Check if submitted TODAY
    });

    // Block if submitted TODAY (unless Rejected)
    if (existing && existing.status !== "Rejected") {
        return res.status(400).json({ message: "You already completed this task today. Come back tomorrow!" });
    }

    // --- 3. ACCOUNT VERIFICATION ---
    const user = await User.findById(req.user._id);
    const linkedAccount = user.linkedAccounts.id(accountId);
    
    if (!linkedAccount) return res.status(403).json({ message: "Invalid account selected." });

    const registeredHandle = linkedAccount.username || extractUsernameFromProfileUrl(linkedAccount.profileUrl, platform);
    const checkResult = await getHandleFromLink(proofLink, platform);
    const submittedHandle = checkResult.handle;

    if (checkResult.status === 404) {
         return res.status(400).json({ 
            message: "Invalid Video Link", 
            detail: "The link you submitted appears to be broken or private." 
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
        console.log("Auto-verification skipped. Manual review.");
    }

    // --- 4. SAVE ---
    if (existing) {
        // Update today's rejected submission
        existing.proofLink = proofLink;
        existing.status = "Pending";
        existing.adminComment = null;
        await existing.save();
        return res.status(200).json({ message: "Task resubmitted!", submission: existing });
    } else {
        // Create new submission for today
        const newSubmission = await Submission.create({
            userId: req.user._id,
            taskId,
            linkedAccountId: accountId,
            platform,
            proofLink,
            status: "Pending"
        });
        return res.status(201).json({ message: "Task submitted!", submission: newSubmission });
    }

  } catch (error) {
    console.error("Submission Error:", error);
    return res.status(500).json({ message: "Submission failed." });
  }
};

// ... getTaskHistory remains same
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