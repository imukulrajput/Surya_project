import { User } from "../models/user.model.js";
import crypto from "crypto";
import { extractUsernameFromProfileUrl } from "../utils/platformChecker.js"; 
import mongoose from "mongoose";

// --- HELPER: Get Current Date in IST (India Time) ---
const getISTDate = () => {
    return new Date().toLocaleString("en-US", { 
        timeZone: "Asia/Kolkata",
        year: 'numeric', 
        month: 'numeric', 
        day: 'numeric' 
    }); // Returns format like "2/12/2026"
};

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

        const handle = extractUsernameFromProfileUrl(profileUrl, platform);

        if (!handle) {
             return res.status(400).json({ 
                message: `Invalid ${platform} URL.`, 
                hint: `Check format: ${platform === 'Moj' ? 'mojapp.in/@user' : 'sharechat.com/profile/user'}`
            });
        }

        // 1. Search for ANY existing account (Active or Inactive)
        const userWithAccount = await User.findOne({
            "linkedAccounts": {
                $elemMatch: {
                    platform: platform,
                    $or: [{ profileUrl: profileUrl }, { username: handle }]
                }
            }
        });

        if (userWithAccount) {
            // Find the specific account object
            const account = userWithAccount.linkedAccounts.find(
                acc => acc.platform === platform && (acc.profileUrl === profileUrl || acc.username === handle)
            );

            // CASE A: Someone ELSE owns it
            if (userWithAccount._id.toString() !== req.user._id.toString()) {
                return res.status(409).json({ message: "This profile is claimed by another user!" });
            }

            // CASE B: User owns it, and it is ACTIVE (Already Linked)
            if (account.active) {
                return res.status(409).json({ message: "You have already linked this account!" });
            }

            // CASE C: User owns it, it is INACTIVE (Re-linking logic)
            if (!account.active) {
                // --- FIX: USE IST DATE CHECK ---
                const todayIST = getISTDate();
                
                // Get the unlinked date in IST as well
                const unlinkedDateIST = account.unlinkedAt 
                    ? new Date(account.unlinkedAt).toLocaleString("en-US", { 
                        timeZone: "Asia/Kolkata",
                        year: 'numeric', 
                        month: 'numeric', 
                        day: 'numeric'
                      })
                    : "Unknown";

                // IF DATES MATCH -> BLOCK (Same Day in India)
                if (todayIST === unlinkedDateIST) {
                    return res.status(400).json({ 
                        message: "Cooldown Active", 
                        hint: "You cannot re-link an account on the same day you unlinked it. Please try again tomorrow." 
                    });
                }

                // IF DATES DIFFER -> REACTIVATE
                await User.updateOne(
                    { _id: req.user._id, "linkedAccounts._id": account._id },
                    { 
                        $set: { 
                            "linkedAccounts.$.active": true,
                            "linkedAccounts.$.linkedAt": new Date() 
                        },
                        $unset: { "linkedAccounts.$.unlinkedAt": "" } 
                    }
                );
                
                return res.status(200).json({ message: "Account Reactivated Successfully!" });
            }
        }

        // CASE D: Brand New Account (Push to Array)
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                linkedAccounts: {
                    platform,
                    profileUrl,
                    username: handle, 
                    isVerified: true, 
                    linkedAt: new Date(),
                    accountId: new Date().getTime().toString(),
                    active: true // Explicitly Active
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

