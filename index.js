import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import socialRoutes from "./routes/social.routes.js";
import cors from "cors";
import taskRoutes from "./routes/task.routes.js";
import supportRoutes from "./routes/support.routes.js"; // <--- ADD THIS
import adminRoutes from "./routes/admin.routes.js"
import walletRouter from "./routes/wallet.routes.js"

// --- RUN THIS ONCE TO FIX THE DATABASE ---
mongoose.connection.once('open', async () => {
    try {
        console.log("Checking for bad indexes...");
        
        // This command forces MongoDB to delete the "Forever Unique" rule
        await mongoose.connection.collection('submissions').dropIndex('taskId_1_linkedAccountId_1');
        
        console.log("✅ SUCCESS: The bad index was deleted. Users can now repeat tasks daily!");
    } catch (error) {
        // If it says "index not found", that's good! It means it's already gone.
        console.log("ℹ️ Index cleanup report:", error.message);
    }
});

dotenv.config();
const app = express();

app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://surya-frontend-steel.vercel.app"
  ],
  credentials: true
}));


app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

  

// Routes

app.get("/", (req, res) => res.send("API running"));
 
app.use("/api/v1/users", authRoutes);      
app.use("/api/v1/social", socialRoutes);
app.use("/api/v1/tasks", taskRoutes);
app.use("/api/v1/support", supportRoutes); // <--- ADD THIS   
app.use("/api/v1/admin", adminRoutes);  

app.use("/api/v1/wallet", walletRouter);     

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));
    })
    .catch((err) => console.log("MongoDB connection error: ", err)); 