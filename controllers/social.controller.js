import crypto from "crypto";
import puppeteer from "puppeteer";
import { User } from "../models/user.model.js";


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
    let browser = null;
    try {
        const { platform, profileUrl } = req.body;
        const verificationCode = req.user.socialVerification?.code; 

        if (!verificationCode) {
            return res.status(400).json({ message: "Please generate a code first." });
        }

        const user = await User.findById(req.user._id);
        const isDuplicate = user.linkedAccounts.some(
            (acc) => acc.platform === platform && acc.profileUrl === profileUrl
        );

        if (isDuplicate) {
            return res.status(409).json({ message: "This account is already linked!" });
        }
   

        console.log(`🔍 Verifying: ${profileUrl}`);

       
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        try {
            await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        } catch (e) {
            console.log("Navigation timeout, checking body anyway...");
        }

        
        await new Promise(r => setTimeout(r, 5000)); 

        const pageText = await page.evaluate(() => document.body.innerText);

        if (pageText.includes(verificationCode)) {
            
          
            await User.findByIdAndUpdate(req.user._id, {
                $push: {
                    linkedAccounts: {
                        platform,
                        profileUrl,
                        isVerified: true,
                        linkedAt: new Date(),
                        accountId: new Date().getTime().toString()
                    }
                },
                $unset: { socialVerification: 1 } 
            });

            return res.status(200).json({ message: "Account Verified Successfully!" });
        } else {
            return res.status(400).json({ 
                message: "Verification code not found.",
                hint: "Make sure your profile is Public and the code is in your Bio."
            });
        }

    } catch (error) {
        console.error("Puppeteer Error:", error);
        return res.status(500).json({ message: "Verification failed. Server Error." });
    } finally {
        if (browser) await browser.close();
    }
};