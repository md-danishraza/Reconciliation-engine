import dotenv from "dotenv";
import { connectDB, disconnectDB } from "../config/db.js";
import { IngestionService } from "../services/ingestion.service.js";
import { logger } from "../utils/logger.js";
import path from "path";
import { fileURLToPath } from "url";
// Get current directory (for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();
/**
 * Seed the database with CSV data
 */
async function seedDatabase() {
    try {
        logger.info("Starting database seeding...");
        // Connect to MongoDB
        await connectDB();
        // Define file paths (adjust based on your structure)
        const datasetsPath = path.join(__dirname, "../../datasets/run_1");
        const userFilePath = path.join(datasetsPath, "user_transactions.csv");
        const exchangeFilePath = path.join(datasetsPath, "exchange_transactions.csv");
        logger.info(`User CSV path: ${userFilePath}`);
        logger.info(`Exchange CSV path: ${exchangeFilePath}`);
        // Optional: Clear existing data (uncomment if you want fresh start)
        // await IngestionService.clearSource('user');
        // await IngestionService.clearSource('exchange');
        // Ingest user transactions
        logger.info("\n📥 Ingesting User Transactions...");
        const userResult = await IngestionService.ingestFromCSV(userFilePath, "user");
        // Ingest exchange transactions
        logger.info("\n📥 Ingesting Exchange Transactions...");
        const exchangeResult = await IngestionService.ingestFromCSV(exchangeFilePath, "exchange");
        // Get final stats
        const stats = await IngestionService.getStats();
        // Print summary report
        console.log("\n" + "=".repeat(60));
        console.log("📊 INGESTION SUMMARY REPORT");
        console.log("=".repeat(60));
        console.log("\n📁 USER TRANSACTIONS:");
        console.log(`   Total rows in CSV: ${userResult.totalRows}`);
        console.log(`   Valid rows: ${userResult.validRows}`);
        console.log(`   Inserted to DB: ${userResult.inserted}`);
        console.log(`   Duplicates skipped: ${userResult.duplicates}`);
        console.log(`   Errors: ${userResult.errors}`);
        if (userResult.qualityIssues.length > 0) {
            console.log(`   Quality Issues: ${userResult.qualityIssues.length}`);
            userResult.qualityIssues.slice(0, 5).forEach((issue) => {
                console.log(`      - Row ${issue.row}: ${issue.field} - ${issue.issue}`);
            });
            if (userResult.qualityIssues.length > 5) {
                console.log(`      ... and ${userResult.qualityIssues.length - 5} more issues`);
            }
        }
        console.log("\n📁 EXCHANGE TRANSACTIONS:");
        console.log(`   Total rows in CSV: ${exchangeResult.totalRows}`);
        console.log(`   Valid rows: ${exchangeResult.validRows}`);
        console.log(`   Inserted to DB: ${exchangeResult.inserted}`);
        console.log(`   Duplicates skipped: ${exchangeResult.duplicates}`);
        console.log(`   Errors: ${exchangeResult.errors}`);
        if (exchangeResult.qualityIssues.length > 0) {
            console.log(`   Quality Issues: ${exchangeResult.qualityIssues.length}`);
            exchangeResult.qualityIssues.forEach((issue) => {
                console.log(`      - Row ${issue.row}: ${issue.field} - ${issue.issue}`);
            });
        }
        console.log("\n📊 DATABASE STATS:");
        console.log(`   Total user transactions: ${stats.userCount}`);
        console.log(`   Total exchange transactions: ${stats.exchangeCount}`);
        console.log(`   User transactions with issues: ${stats.userWithIssues}`);
        console.log(`   Exchange transactions with issues: ${stats.exchangeWithIssues}`);
        console.log(`   Invalid user transactions (not matchable): ${stats.userInvalidCount}`);
        console.log(`   Invalid exchange transactions (not matchable): ${stats.exchangeInvalidCount}`);
        console.log("\n✅ Seeding completed successfully!");
    }
    catch (error) {
        logger.error("Seeding failed:", error);
        process.exit(1);
    }
    finally {
        await disconnectDB();
    }
}
// Run the seed function
seedDatabase();
