import mongoose, { Schema, Document } from "mongoose";

export interface IReconciliationRun extends Document {
  runId: string;
  startedAt: Date;
  completedAt?: Date;
  status: "pending" | "running" | "completed" | "failed";
  config: {
    timestampToleranceSeconds: number;
    quantityTolerancePct: number;
  };
  summary: {
    matched: number;
    conflicting: number;
    unmatchedUser: number;
    unmatchedExchange: number;
    totalUserTransactions: number;
    totalExchangeTransactions: number;
    totalValidUserTransactions: number;
    totalValidExchangeTransactions: number;
  };
  matches: Array<{
    userTransactionId: mongoose.Types.ObjectId;
    exchangeTransactionId: mongoose.Types.ObjectId;
    matchScore: number;
    isConflicting: boolean;
    conflictReason?: string;
    timestampDiff?: number;
    quantityDiff?: number;
  }>;
  unmatchedUserIds: mongoose.Types.ObjectId[];
  unmatchedExchangeIds: mongoose.Types.ObjectId[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReconciliationRunSchema = new Schema<IReconciliationRun>(
  {
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
  },
  {
    timestamps: true,
  }
);

export const ReconciliationRun = mongoose.model<IReconciliationRun>(
  "ReconciliationRun",
  ReconciliationRunSchema
);
