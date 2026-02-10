import { Support } from "../models/Support.js";

export const createSupportTicket = async (req, res) => {
  try {
    const { email, subject, message } = req.body;
    
    
    if (!email || !subject || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }

  
    await Support.create({
      user: req.user?._id || null, 
      email,
      subject,
      message
    });

    return res.status(201).json({ message: "Query sent! We will contact you shortly." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to send message." });
  }
};  