import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const socialAccountSchema = new mongoose.Schema({
    platform: { type: String, required: true }, 
    profileUrl: { type: String, required: true },
    username: { type: String }, // <--- Add this field
    linkedAt: { type: Date, default: Date.now },
    isVerified: { type: Boolean, default: false },
    accountId: { type: String }
});
   
const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: [true, "Password is required"]
    },
    refreshToken: {
        type: String
    }, 
    role: { 
        type: String, 
        enum: ["user", "admin"], 
        default: "user" 
    }, 

    socialVerification: {
        code: String,
        expiresAt: Date  
    },
    walletBalance: { type: Number, default: 0 },    
    linkedAccounts: [socialAccountSchema],  

    forgotPasswordToken: String,
    forgotPasswordTokenExpiry: Date, 
}, { timestamps: true }); 

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 10);
});


// Instance method to check password
userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

// Generate Access Token
userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            fullName: this.fullName
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    );
};

// Generate Refresh Token
userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            _id: this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    );
};

export const User = mongoose.model("User", userSchema);