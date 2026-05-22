import mongoose, { Schema, Document } from "mongoose";

export interface ITransaction extends Document {
  source: "user" | "exchange";
  originalRow: Record<string, any>;
  transactionId?: string;
  timestamp: Date | null; // Allow null for invalid timestamps
  asset: string;
  normalizedAsset: string;
  quantity: number;
  type: string;
  normalizedType: string;
  priceUsd?: number;
  fee?: number;
  note?: string;
  dataQualityIssues: string[];
  reconciliationRunId?: string;
  isMatched: boolean;
  isValid: boolean; // track if transaction is valid for matching
  matchedWith?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    source: {
      type: String,
      enum: ["user", "exchange"],
      required: true,
      index: true,
    },
    originalRow: {
      type: Schema.Types.Mixed,
      required: true,
    },
    transactionId: {
      type: String,
      sparse: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: false,
      index: true,
    },
    asset: {
      type: String,
      required: true,
    },
    normalizedAsset: {
      type: String,
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => v >= 0,
        message: "Quantity must be positive",
      },
    },
    type: {
      type: String,
      required: true,
    },
    normalizedType: {
      type: String,
      required: true,
      index: true,
    },
    priceUsd: Number,
    fee: Number,
    note: String,
    dataQualityIssues: [String],
    reconciliationRunId: {
      type: String,
      index: true,
    },
    isMatched: {
      type: Boolean,
      default: false,
    },
    isValid: {
      type: Boolean,
      default: true,
      index: true, // Index for filtering valid transactions
    },
    matchedWith: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for matching queries (only for valid transactions)
TransactionSchema.index(
  {
    normalizedAsset: 1,
    normalizedType: 1,
    timestamp: 1,
    quantity: 1,
  },
  {
    partialFilterExpression: { isValid: true, timestamp: { $ne: null } },
  }
);

export const Transaction = mongoose.model<ITransaction>(
  "Transaction",
  TransactionSchema
);
