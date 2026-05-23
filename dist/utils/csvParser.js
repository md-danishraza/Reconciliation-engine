// Reads CSV files line by line, handles errors gracefully,
// and converts each row to a JavaScript object.
import fs from "fs";
import csv from "csv-parser";
import { logger } from "./logger.js";
/**
 * Parses CSV file with error handling
 * @param options - Configuration options
 * @returns Promise with parsed data and errors
 */
export async function parseCSV(options) {
    const { filePath, skipEmptyLines = true, strictMode = false } = options;
    const results = [];
    const errors = [];
    let rowCount = 0;
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv({
            // Trim whitespace from values
            mapValues: ({ header, value }) => {
                if (typeof value === "string") {
                    return value.trim();
                }
                return value;
            },
        }))
            .on("data", (row) => {
            rowCount++;
            try {
                // Basic validation - check if row has any data
                // handles empty lines perfectly right here
                const hasData = Object.values(row).some((val) => val && val !== "");
                if (!hasData) {
                    errors.push({
                        row: rowCount,
                        error: "Empty row with no data",
                        rawRow: row,
                    });
                    return;
                }
                results.push(row);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown parsing error";
                errors.push({
                    row: rowCount,
                    error: errorMessage,
                    rawRow: row,
                });
                if (strictMode) {
                    reject(new Error(`Strict mode: Error on row ${rowCount}: ${errorMessage}`));
                }
            }
        })
            .on("end", () => {
            logger.info(`CSV Parsing completed: ${results.length} valid rows, ${errors.length} errors out of ${rowCount} total rows`);
            resolve({
                data: results,
                errors,
                totalRows: rowCount,
                validRows: results.length,
            });
        })
            .on("error", (error) => {
            logger.error("CSV Parsing failed:", error);
            reject(error);
        });
    });
}
/**
 * Utility to parse date strings safely
 */
export function parseDateSafely(dateString) {
    if (!dateString || dateString.trim() === "") {
        return null;
    }
    const parsed = new Date(dateString);
    // Check if date is valid
    if (isNaN(parsed.getTime())) {
        return null;
    }
    return parsed;
}
/**
 * Utility to parse number safely
 */
export function parseNumberSafely(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) {
        return null;
    }
    return num;
}
