//  Takes validated transactions, saves them to MongoDB, handles duplicates, and logs everything.
import { Transaction } from "../models/Transaction.model.js";
import DataQualityService from "./dataQuality.service.js";
import { parseCSV } from "../utils/csvParser.js";
import { logger } from "../utils/logger.js";
export class IngestionService {
    /**
     * Ingest transactions from a CSV file
     */
    static async ingestFromCSV(filePath, source) {
        logger.info(`Starting ingestion for ${source} from ${filePath}`);
        // Step 1: Parse CSV
        const parseResult = await parseCSV({ filePath, strictMode: false });
        const result = {
            source,
            totalRows: parseResult.totalRows,
            validRows: 0,
            inserted: 0,
            duplicates: 0,
            errors: parseResult.errors.length,
            qualityIssues: [],
            filePath,
        };
        // Step 2: Fetch existing transactions for duplicate detection
        const existingTransactions = await Transaction.find({ source });
        // Step 3: Process each row
        // Process each row
        for (let i = 0; i < parseResult.data.length; i++) {
            const row = parseResult.data[i];
            const rowNumber = i + 1;
            // Validate the transaction
            const validation = DataQualityService.validateTransaction(row, source, rowNumber);
            // Always create a transaction record (even if invalid)
            const normalizedAsset = validation.isValid
                ? IngestionService.normalizeAsset(validation.cleanedData.asset)
                : "INVALID";
            const normalizedType = validation.isValid && validation.cleanedData.type
                ? IngestionService.normalizeType(validation.cleanedData.type, source)
                : "INVALID";
            // Check for duplicates only if it has an ID
            let isDuplicate = false;
            if (validation.cleanedData.transactionId) {
                isDuplicate = await DataQualityService.detectDuplicate(validation.cleanedData.transactionId, validation.cleanedData.timestamp, validation.cleanedData.asset, validation.cleanedData.quantity || 0, existingTransactions);
            }
            if (isDuplicate) {
                result.duplicates++;
                logger.warn(`Duplicate transaction detected in ${source}:`, validation.cleanedData);
                continue;
            }
            // Save to database (ALWAYS save, even if invalid)
            try {
                const transaction = new Transaction({
                    source,
                    originalRow: row,
                    transactionId: validation.cleanedData.transactionId,
                    timestamp: validation.cleanedData.timestamp || null,
                    asset: validation.cleanedData.asset || "unknown",
                    normalizedAsset,
                    quantity: validation.cleanedData.quantity || 0,
                    type: validation.cleanedData.type || "unknown",
                    normalizedType,
                    priceUsd: validation.cleanedData.priceUsd,
                    fee: validation.cleanedData.fee,
                    note: row.note,
                    dataQualityIssues: validation.cleanedData.dataQualityIssues || [],
                    isMatched: false,
                    isValid: validation.isValid, // CRITICAL: Set isValid flag
                });
                if (validation.isValid) {
                    result.validRows++; // Count only valid transactions
                }
                await transaction.save();
                result.inserted++;
                if (!validation.isValid) {
                    result.qualityIssues.push(...validation.issues);
                    logger.warn(`Saved invalid transaction from row ${rowNumber}:`, validation.issues);
                }
                // Cache for duplicate detection
                existingTransactions.push(transaction);
            }
            catch (dbError) {
                logger.error(`Failed to save transaction:`, dbError);
                result.errors++;
                result.qualityIssues.push({
                    row: rowNumber,
                    field: "database",
                    issue: `Database error: ${dbError instanceof Error ? dbError.message : "Unknown error"}`,
                });
            }
        }
        // Step 4: Log summary
        logger.info(`Ingestion completed for ${source}:`, {
            valid: result.validRows,
            inserted: result.inserted,
            duplicates: result.duplicates,
            errors: result.errors,
        });
        return result;
    }
    /**
     * Normalize asset names (handle aliases)
     */
    static normalizeAsset(asset) {
        const assetLower = asset.toLowerCase().trim();
        // Asset aliases mapping
        const aliases = {
            bitcoin: "BTC",
            btc: "BTC",
            xbt: "BTC",
            ethereum: "ETH",
            eth: "ETH",
            tether: "USDT",
            usdt: "USDT",
            "usd coin": "USDC",
            usdc: "USDC",
            solana: "SOL",
            sol: "SOL",
            polygon: "MATIC",
            matic: "MATIC",
            chainlink: "LINK",
            link: "LINK",
        };
        return aliases[assetLower] || asset.toUpperCase();
    }
    /**
     * Normalize transaction types (handle opposite perspectives)
     */
    static normalizeType(type, source) {
        const typeUpper = type.toUpperCase().trim();
        // If it's a user transaction, convert to exchange perspective for matching
        if (source === "user") {
            const perspectiveMap = {
                TRANSFER_OUT: "TRANSFER_IN",
                WITHDRAWAL: "TRANSFER_IN",
                DEPOSIT: "TRANSFER_OUT",
                PURCHASE: "BUY",
                SALE: "SELL",
                TRADE_BUY: "BUY",
                TRADE_SELL: "SELL",
            };
            return perspectiveMap[typeUpper] || typeUpper;
        }
        // Exchange transactions are already in standard format
        return typeUpper;
    }
    /**
     * Clear all transactions for a source (useful for re-ingestion)
     */
    static async clearSource(source) {
        const result = await Transaction.deleteMany({ source });
        logger.info(`Cleared ${result.deletedCount} transactions for source: ${source}`);
    }
    /**
     * Get ingestion statistics
     */
    static async getStats() {
        const userCount = await Transaction.countDocuments({ source: "user" });
        const exchangeCount = await Transaction.countDocuments({
            source: "exchange",
        });
        // Count transactions with data quality issues
        const userWithIssues = await Transaction.countDocuments({
            source: "user",
            dataQualityIssues: { $ne: [] },
        });
        const exchangeWithIssues = await Transaction.countDocuments({
            source: "exchange",
            dataQualityIssues: { $ne: [] },
        });
        // Count invalid transactions (isValid = false)
        const userInvalidCount = await Transaction.countDocuments({
            source: "user",
            isValid: false,
        });
        const exchangeInvalidCount = await Transaction.countDocuments({
            source: "exchange",
            isValid: false,
        });
        return {
            userCount,
            exchangeCount,
            userWithIssues,
            exchangeWithIssues,
            userInvalidCount,
            exchangeInvalidCount,
        };
    }
}
