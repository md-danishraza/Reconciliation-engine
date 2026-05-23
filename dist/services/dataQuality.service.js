import { parseDateSafely, parseNumberSafely } from "../utils/csvParser";
export class DataQualityService {
    static validateTransaction(row, source, rowNumber) {
        const issues = [];
        // Initialize cleanedData with defaults
        const cleanedData = {
            source,
            originalRow: row,
            dataQualityIssues: [],
            transactionId: undefined,
            timestamp: undefined,
            type: undefined,
            asset: undefined,
            quantity: 0,
            priceUsd: undefined,
            fee: undefined,
        };
        // 1. Validate Transaction ID
        if (row.transaction_id) {
            if (source === "user" && !row.transaction_id.startsWith("USR-")) {
                issues.push({
                    row: rowNumber,
                    field: "transaction_id",
                    issue: `User transaction ID doesn't follow expected format: ${row.transaction_id}`,
                    severity: "warning",
                });
            }
            if (source === "exchange" && !row.transaction_id.startsWith("EXC-")) {
                issues.push({
                    row: rowNumber,
                    field: "transaction_id",
                    issue: `Exchange transaction ID doesn't follow expected format: ${row.transaction_id}`,
                    severity: "warning",
                });
            }
            cleanedData.transactionId = row.transaction_id;
        }
        // 2. Validate Timestamp (CRITICAL)
        let hasTimestampError = false;
        if (!row.timestamp || row.timestamp.trim() === "") {
            issues.push({
                row: rowNumber,
                field: "timestamp",
                issue: "Missing timestamp - transaction cannot be matched",
                severity: "error",
            });
            hasTimestampError = true;
        }
        else {
            const timestamp = parseDateSafely(row.timestamp);
            if (!timestamp) {
                issues.push({
                    row: rowNumber,
                    field: "timestamp",
                    issue: `Invalid timestamp format: "${row.timestamp}" - expected ISO format like 2024-03-01T09:00:00Z`,
                    severity: "error",
                });
                hasTimestampError = true;
            }
            else {
                cleanedData.timestamp = timestamp;
            }
        }
        // 3. Validate Type
        let hasTypeError = false;
        if (!row.type || row.type.trim() === "") {
            issues.push({
                row: rowNumber,
                field: "type",
                issue: "Missing transaction type (BUY/SELL/TRANSFER_IN/TRANSFER_OUT)",
                severity: "error",
            });
            hasTypeError = true;
        }
        else {
            cleanedData.type = row.type;
        }
        // 4. Validate Asset
        let hasAssetError = false;
        if (!row.asset || row.asset.trim() === "") {
            issues.push({
                row: rowNumber,
                field: "asset",
                issue: "Missing asset symbol",
                severity: "error",
            });
            hasAssetError = true;
        }
        else {
            cleanedData.asset = row.asset;
        }
        // 5. Validate Quantity
        let hasQuantityError = false;
        const quantity = parseNumberSafely(row.quantity);
        if (quantity === null) {
            issues.push({
                row: rowNumber,
                field: "quantity",
                issue: `Invalid quantity value: "${row.quantity}" - must be a number`,
                severity: "error",
            });
            hasQuantityError = true;
            cleanedData.quantity = 0; // Default value
        }
        else if (quantity <= 0) {
            issues.push({
                row: rowNumber,
                field: "quantity",
                issue: `Quantity must be positive: ${quantity}`,
                severity: "error",
            });
            hasQuantityError = true;
            cleanedData.quantity = 0; // Default value
        }
        else {
            cleanedData.quantity = quantity;
        }
        // 6-7. Price and Fee validation (same as before)
        if (row.price_usd && row.price_usd !== "") {
            const price = parseNumberSafely(row.price_usd);
            if (price === null) {
                issues.push({
                    row: rowNumber,
                    field: "price_usd",
                    issue: `Invalid price format: "${row.price_usd}" - expected number`,
                    severity: "warning",
                });
            }
            else if (price < 0) {
                issues.push({
                    row: rowNumber,
                    field: "price_usd",
                    issue: `Price cannot be negative: ${price}`,
                    severity: "warning",
                });
            }
            else {
                cleanedData.priceUsd = price;
            }
        }
        if (row.fee && row.fee !== "") {
            const fee = parseNumberSafely(row.fee);
            if (fee === null) {
                issues.push({
                    row: rowNumber,
                    field: "fee",
                    issue: `Invalid fee format: "${row.fee}" - expected number`,
                    severity: "warning",
                });
            }
            else if (fee < 0) {
                issues.push({
                    row: rowNumber,
                    field: "fee",
                    issue: `Fee cannot be negative: ${fee}`,
                    severity: "warning",
                });
            }
            else {
                cleanedData.fee = fee;
            }
        }
        // Determine if transaction has critical errors
        const hasCriticalErrors = hasTimestampError || hasQuantityError || hasTypeError || hasAssetError;
        // Store all issues as strings
        cleanedData.dataQualityIssues = issues.map((i) => `${i.field}: ${i.issue} (${i.severity})`);
        return {
            isValid: !hasCriticalErrors,
            issues,
            cleanedData, // Always defined now
        };
    }
    // Rest of the class remains the same...
    static async detectDuplicate(transactionId, timestamp, asset, quantity, existingTransactions) {
        if (transactionId) {
            const exists = existingTransactions.some((t) => t.transactionId === transactionId);
            if (exists)
                return true;
        }
        if (timestamp && asset) {
            const fuzzyMatch = existingTransactions.some((t) => {
                if (!t.timestamp)
                    return false;
                const timeDiff = Math.abs(t.timestamp.getTime() - timestamp.getTime());
                const isSameAsset = t.asset?.toLowerCase() === asset.toLowerCase();
                const isSameQuantity = Math.abs(t.quantity - quantity) < 0.0001;
                return timeDiff < 60000 && isSameAsset && isSameQuantity;
            });
            return fuzzyMatch;
        }
        return false;
    }
}
export default DataQualityService;
