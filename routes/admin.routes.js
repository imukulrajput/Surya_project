import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";
import * as Admin from "../controllers/admin.controller.js";

const router = Router();

router.use(verifyJWT, verifyAdmin); 

// Dashboard
router.get("/stats", Admin.getDashboardStats);

// Tasks
router.post("/batch-create", Admin.createDailyBatch);
router.get("/tasks", Admin.getTasksByDate);
router.delete("/tasks/:id", Admin.deleteTask);
router.put("/tasks/:id", Admin.updateTask);           // <--- NEW: Update One

// Approvals
router.get("/submissions", Admin.getPendingSubmissions);
router.post("/decide", Admin.decideSubmission);

// Users
router.get("/users", Admin.getAllUsers);
router.post("/users/ban", Admin.toggleUserBan);
  
// Finance
router.get("/withdrawals", verifyJWT, verifyAdmin, Admin.getWithdrawals);
router.post("/withdrawals/:id", verifyJWT, verifyAdmin, Admin.processWithdrawal);

// Support
router.get("/support", Admin.getSupportTickets);
router.post("/support/status", Admin.updateTicketStatus);

// Settings
router.post("/settings", Admin.updateSettings);

router.post("/announcement", Admin.updateAnnouncement) 

router.get("/withdrawals/export", Admin.exportWithdrawals) 



export default router;