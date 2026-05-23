import mongoose, { Schema } from "mongoose";
const ReconciliationRunSchema = new Schema({
    runId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    startedAt: {
        type: Date,
        required: true,
    },
    completedAt: Date,
    status: {
        type: String,
        enum: ["pending", "running", "completed", "failed"],
        default: "pending",
    },
    config: {
        timestampToleranceSeconds: {
            type: Number,
            required: true,
            default: 300,
        },
        quantityTolerancePct: {
            type: Number,
            required: true,
            default: 0.01,
        },
    },
    summary: {
        matched: { type: Number, default: 0 },
        conflicting: { type: Number, default: 0 },
        unmatchedUser: { type: Number, default: 0 },
        unmatchedExchange: { type: Number, default: 0 },
        totalUserTransactions: { type: Number, default: 0 },
        totalExchangeTransactions: { type: Number, default: 0 },
        totalValidUserTransactions: { type: Number, default: 0 },
        totalValidExchangeTransactions: { type: Number, default: 0 },
    },
    matches: [
        {
            userTransactionId: {
                type: Schema.Types.ObjectId,
                ref: "Transaction",
                required: true,
            },
            exchangeTransactionId: {
                type: Schema.Types.ObjectId,
                ref: "Transaction",
                required: true,
            },
            matchScore: { type: Number, required: true, min: 0, max: 1 },
            isConflicting: { type: Boolean, default: false },
            conflictReason: String,
            timestampDiff: Number,
            quantityDiff: Number,
        },
    ],
    unmatchedUserIds: [{ type: Schema.Types.ObjectId, ref: "Transaction" }],
    unmatchedExchangeIds: [{ type: Schema.Types.ObjectId, ref: "Transaction" }],
    error: String,
}, {
    timestamps: true,
});
export const ReconciliationRun = mongoose.model("ReconciliationRun", ReconciliationRunSchema);
