import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { createSupportTicket } from "../controllers/support.controller.js";

const router = Router();


router.post("/", verifyJWT, createSupportTicket);

export default router;