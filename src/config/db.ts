import mongoose from "mongoose";
import dotenv from "dotenv";
import { logger } from "../utils/logger.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "reconciliation_db";

if (!MONGODB_URI) {
  logger.error("MONGODB_URI is not defined in environment variables");
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

export const connectDB = async (): Promise<void> => {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is required");
  }

  try {
    logger.info("Connecting to MongoDB...");

    await mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });

    logger.info("✅ MongoDB connected successfully");

    mongoose.connection.on("error", (error) => {
      logger.error("MongoDB connection error:", error);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
    });
  } catch (error) {
    logger.error("Failed to connect to MongoDB:", error);
    throw error;
  }
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
};
