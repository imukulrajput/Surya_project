import mongoose from "mongoose";
import dotenv from "dotenv";
// Make sure this path points correctly to your Task model
import { Task } from "./models/Task.js"; 

dotenv.config(); // Loads your .env file so we get the MONGO_URI

const runMigration = async () => {
  try {
    // 1. Connect to the database
    console.log("Connecting to the database...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected successfully!");

    // 2. Find all tasks where 'isDeleted' does not exist yet, and set it to false
    const result = await Task.updateMany(
      { isDeleted: { $exists: false } }, 
      { $set: { isDeleted: false } }
    );

    console.log(`Migration complete! Successfully updated ${result.modifiedCount} old tasks.`);

  } catch (error) {
    console.error("Migration failed with error:", error);
  } finally {
    // 3. Always disconnect when done so the script doesn't hang
    await mongoose.disconnect();
    console.log("Disconnected from database.");
    process.exit(0);
  }
};

runMigration();