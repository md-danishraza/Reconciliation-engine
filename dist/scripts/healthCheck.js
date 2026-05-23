import dotenv from "dotenv";
dotenv.config();
async function healthCheck() {
    console.log("Running health check...");
    // Check MongoDB URI is set
    if (!process.env.MONGODB_URI) {
        console.error("❌ MONGODB_URI is not set");
        process.exit(1);
    }
    console.log("✅ Environment variables check passed");
    process.exit(0);
}
healthCheck();
