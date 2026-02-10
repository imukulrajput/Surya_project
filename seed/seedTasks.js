import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Task } from "../models/Task.js"; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const seedTasks = async () => {
    try {
        if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is undefined.");

        await mongoose.connect(process.env.MONGODB_URI);
        const today = new Date().toISOString().split('T')[0];

        // 50 Tasks with Google Drive Links
        const dummyTasks = Array.from({ length: 50 }).map((_, i) => ({
            title: `Daily Viral Task #${i + 1}`,
            // We use a generic Google Drive folder link or file link here
            videoUrl: "https://drive.google.com/file/d/1Bop-sHq2b2A6/view?usp=sharing", 
            caption: `Watch this amazing video! Task number ${i + 1} #viral #trending #daily`,
            rewardAmount: 2.5,
            batchDate: today,
            active: true
        }));

        await Task.deleteMany({ batchDate: today }); // Clear old entries for today
        await Task.insertMany(dummyTasks);
        console.log(`✅ Success! 50 Drive-Linked Tasks added for: ${today}`);
        
        process.exit();
    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
};

seedTasks();