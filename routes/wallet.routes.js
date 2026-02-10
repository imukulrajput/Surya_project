import { Router } from "express";
import { 
    requestWithdrawal, 
    getWithdrawalHistory, 
    linkPayoutMethod, 
    getPayoutMethods 
} from "../controllers/wallet.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Routes
router.post("/methods", verifyJWT, linkPayoutMethod); // Link Account
router.get("/methods", verifyJWT, getPayoutMethods);  // Get Account Info
router.post("/withdraw", verifyJWT, requestWithdrawal); // Request Money
router.get("/history", verifyJWT, getWithdrawalHistory); // View History

export default router;