import dotenv from "dotenv";
dotenv.config();
export const config = {
    port: parseInt(process.env.PORT || "3000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
    mongodb: {
        uri: process.env.MONGODB_URI || "",
        dbName: process.env.MONGODB_DB_NAME || "reconciliation_db",
    },
    reconciliation: {
        defaultTimestampTolerance: parseInt(process.env.TIMESTAMP_TOLERANCE_SECONDS || "300", 10),
        defaultQuantityTolerance: parseFloat(process.env.QUANTITY_TOLERANCE_PCT || "0.01"),
    },
    assetAliases: {
        BTC: ["bitcoin", "btc", "xbt"],
        ETH: ["ethereum", "eth"],
        USDT: ["tether", "usdt"],
        USDC: ["usd coin", "usdc"],
    },
    typeMapping: {
        TRANSFER_IN: ["TRANSFER_OUT", "WITHDRAWAL"],
        TRANSFER_OUT: ["TRANSFER_IN", "DEPOSIT"],
        BUY: ["PURCHASE", "TRADE_BUY"],
        SELL: ["SALE", "TRADE_SELL"],
    },
};
