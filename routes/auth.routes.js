import { Router } from "express";
import { registerUser, loginUser, forgotPassword  , resetPassword , getUserProfile ,  getAnnouncement , logoutUser} from "../controllers/auth.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js"; 


const router = Router();

router.post("/signup", registerUser);
router.post("/login", loginUser);

router.post("/logout", verifyJWT, logoutUser); 

router.post("/forgot-password", forgotPassword); 
router.post("/reset-password/:token", resetPassword);
router.get("/me", verifyJWT, getUserProfile);

router.get("/announcement", verifyJWT, getAnnouncement); 

export default router;