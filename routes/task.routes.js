import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { getDailyTasks, submitTask , getTaskHistory } from "../controllers/task.controller.js";

const router = Router();

router.get("/daily", verifyJWT, getDailyTasks);
router.post("/submit", verifyJWT, submitTask);
router.get("/history", verifyJWT, getTaskHistory);

export default router; 