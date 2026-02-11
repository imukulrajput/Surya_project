import { User } from "../models/user.model.js";
import crypto from "crypto";
import { extractUsernameFromProfileUrl } from "../utils/platformChecker.js"; 

export const generateVerificationCode = async (req, res) => {
    try {
        const code = "SW-" + crypto.randomBytes(4).toString('hex').toUpperCase();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); 

        const user = await User.findById(req.user._id);
        user.socialVerification = { code, expiresAt };
        await user.save({ validateBeforeSave: false });

        return res.status(200).json({ 
            message: "Code generated", 
            code, 
            expiresAt    
        });
    } catch (error) {
        return res.status(500).json({ message: "Error generating code" });
    }
};

export const verifySocialAccount = async (req, res) => {
    try {
        const { platform, profileUrl } = req.body;
        
        if (!profileUrl || !platform) {
            return res.status(400).json({ message: "Profile URL is required." });
        }

        // 1. Extract Username from Profile URL
        const handle = extractUsernameFromProfileUrl(profileUrl, platform);

        if (!handle) {
             return res.status(400).json({ 
                message: `Invalid ${platform} URL.`, 
                hint: `Check format: ${platform === 'Moj' ? 'mojapp.in/@user' : 'sharechat.com/profile/user'}`
            });
        }

        // --- CRITICAL SECURITY FIX: GLOBAL CHECK ---
        // Check if ANY user (not just me) has already claimed this Profile URL or Username
        const existingClaim = await User.findOne({
            "linkedAccounts": {
                $elemMatch: {
                    platform: platform,   
                    $or: [
                        { profileUrl: profileUrl },
                        { username: handle }
                    ]
                }
            }
        });

        if (existingClaim) {
            // If the user found is ME, it's a duplicate. If it's someone else, it's theft.
            if (existingClaim._id.toString() === req.user._id.toString()) {
                 return res.status(409).json({ message: "You have already linked this account!" });
            } else {
                 return res.status(409).json({ message: "This social profile is already claimed by another user!" });
            }
        }
        // --- END FIX ---

        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                linkedAccounts: {
                    platform,
                    profileUrl,
                    username: handle, 
                    isVerified: true,  
                    linkedAt: new Date(),
                    accountId: new Date().getTime().toString()
                }
            },
            $unset: { socialVerification: 1 } 
        });

        return res.status(200).json({ message: "Account Linked Successfully!" });

    } catch (error) {
        console.error("Link Error:", error);
        return res.status(500).json({ message: "Linking failed. Server Error." });
    }
};