import crypto from "crypto"; 
import { User } from "../models/user.model.js";
import { sendEmail } from "../utils/sendEmail.js";
import { SystemSetting } from "../models/SystemSetting.js";
import jwt from "jsonwebtoken";


const generateAccessAndRefereshTokens = async (userId) => {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
};

export const registerUser = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(409).json({ message: "User already exists" });

    // Create User
    const user = await User.create({ fullName, email, password });

    // --- NEW: Generate Tokens Immediately (Auto-Login) ---
    // Assuming you have this method on your User model (standard practice)
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    const accessOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 15 * 60 * 1000 
    };

    const refreshOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    return res.status(201)
      .cookie("accessToken", accessToken, accessOptions)
      .cookie("refreshToken", refreshToken, refreshOptions)
      .json({
        user,
        accessToken,
        refreshToken,
        message: "User registered and logged in successfully"
      });

  } catch (error) {
    return res.status(500).json({ message: "Registration failed", error: error.message });
  }
};


export const logoutUser = async (req, res) => {
    try {
        await User.findByIdAndUpdate(
            req.user._id,
            { $unset: { refreshToken: 1 } }, 
            { new: true }
        );

        const options = {
          httpOnly: true,
          secure: true,       // Must be TRUE because your backend is HTTPS
          sameSite: "None",   // Must be NONE to allow cross-site (Localhost -> Render)
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        };

        return res
            .status(200)
            .clearCookie("accessToken", options)
            .clearCookie("refreshToken", options)
            .json({ message: "User logged out" });
            
    } catch (error) {
        return res.status(500).json({ message: "Logout failed" });
    }
};

export const loginUser = async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User does not exist" });


    if (user.isBanned) {
        return res.status(403).json({ message: "Your account has been banned. Contact support." });
    }
    
    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) return res.status(401).json({ message: "Invalid credentials" });

    const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(user._id);

   
 const accessOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 15 * 60 * 1000 // 15 minutes
    };

    const refreshOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days <--- THIS WAS MISSING
    }; 
       
    return res
        .status(200)
        .cookie("accessToken", accessToken, accessOptions)
        .cookie("refreshToken", refreshToken, refreshOptions)
        .json({ message: "Logged in successfully", accessToken });
};


export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });

    
    const resetToken = crypto.randomBytes(20).toString("hex");

    user.forgotPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.forgotPasswordTokenExpiry = Date.now() + 15 * 60 * 1000; 
    await user.save();

    const resetUrl = `${process.env.DOMAIN}/reset-password/${resetToken}`;

    const message = `<h1>Reset Your Password</h1>
                     <p>Click the link below to reset your password. It expires in 15 minutes.</p>
                     <a href="${resetUrl}" clicktracking=off>${resetUrl}</a>`;

    try {
        await sendEmail({ email: user.email, subject: "Password Reset Request", message });
        res.status(200).json({ message: "Reset link sent to your email" });
    } catch (error) {
        user.forgotPasswordToken = undefined;
        user.forgotPasswordTokenExpiry = undefined;
        await user.save();
        res.status(500).json({ message: "Email could not be sent" });
    }
};


export const resetPassword = async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
        forgotPasswordToken: hashedToken,
        forgotPasswordTokenExpiry: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.password = password;
    user.forgotPasswordToken = undefined;
    user.forgotPasswordTokenExpiry = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successful! You can now login." });
};

export const getUserProfile = async (req, res) => {
   
    return res.status(200).json({
        message: "User fetched successfully",
        user: req.user
    });     
};

export const getAnnouncement = async (req, res) => {
    try {
        const setting = await SystemSetting.findOne({ key: "global_announcement" });
        return res.status(200).json({ announcement: setting?.value || null });
    } catch (error) {
        return res.status(500).json({ message: "Error fetching announcement" });
    }
};   

 export const refreshAccessToken = async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken; 

    if (!incomingRefreshToken) {
        return res.status(401).json({ message: "Unauthorized request" });
    }

    try {
        // 1. Verify the incoming token
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        // 2. Find user & check if the token matches what is in the DB
        // (This prevents reuse of old tokens if you are using rotation)
        const user = await User.findById(decodedToken?._id);

        if (!user) {
            return res.status(401).json({ message: "Invalid refresh token" });
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            return res.status(401).json({ message: "Refresh token is expired or used" });
        }

        // 3. Generate NEW tokens (Rotation)
       const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefereshTokens(user._id);

        // 4. Set Cookies
       const accessOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 15 * 60 * 1000 
    };

    const refreshOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }; 

        return res
            .status(200)
            .cookie("accessToken", accessToken, accessOptions)
            .cookie("refreshToken", newRefreshToken, refreshOptions) // Rotate the refresh token
            .json({
                accessToken,
                refreshToken: newRefreshToken,
                message: "Access token refreshed"
            });

    } catch (error) {
        return res.status(401).json({ message: error?.message || "Invalid refresh token" });
    }
};