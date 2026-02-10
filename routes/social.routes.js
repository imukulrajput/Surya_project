import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { generateVerificationCode, verifySocialAccount } from "../controllers/social.controller.js";

const router = Router();

// Both routes require the user to be logged in
router.post("/generate-code", verifyJWT, generateVerificationCode);
router.post("/verify", verifyJWT, verifySocialAccount);

export default router;