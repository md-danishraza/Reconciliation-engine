import { connectDB, disconnectDB } from "../config/db.js";
import { Transaction } from "../models/Transaction.model.js";
async function testIngestion() {
    await connectDB();
    // Count transactions
    const userCount = await Transaction.countDocuments({ source: "user" });
    const exchangeCount = await Transaction.countDocuments({
        source: "exchange",
    });
    console.log(`User transactions: ${userCount}`);
    console.log(`Exchange transactions: ${exchangeCount}`);
    // Find transactions with issues
    const problematicUsers = await Transaction.find({
        source: "user",
        dataQualityIssues: { $ne: [] },
    });
    console.log(`\nTransactions with quality issues: ${problematicUsers.length}`);
    problematicUsers.forEach((t) => {
        console.log(`  - ${t.transactionId || "No ID"}: ${t.dataQualityIssues.join(", ")}`);
    });
    // Check normalized fields
    const bitcoinTransaction = await Transaction.findOne({
        source: "user",
        asset: "bitcoin",
    });
    if (bitcoinTransaction) {
        console.log(`\nNormalization test:`);
        console.log(`  Original asset: ${bitcoinTransaction.asset}`);
        console.log(`  Normalized asset: ${bitcoinTransaction.normalizedAsset}`);
    }
    await disconnectDB();
}
testIngestion();
