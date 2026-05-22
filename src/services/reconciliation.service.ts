import {
  ReconciliationRun,
  IReconciliationRun,
} from "../models/ReconciliationRun.model.js";
import { Transaction } from "../models/Transaction.model.js";
import { MatchingService } from "./matching.service.js";
import { logger } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

export interface ReconciliationConfig {
  timestampToleranceSeconds: number;
  quantityTolerancePct: number;
  resetPreviousMatches?: boolean;
}

export class ReconciliationService {
  /**
   * Start a new reconciliation run
   */
  static async startReconciliation(
    config: ReconciliationConfig
  ): Promise<IReconciliationRun> {
    const runId = `rec_${Date.now()}_${uuidv4().slice(0, 8)}`;

    // Set default for resetPreviousMatches
    const shouldReset = config.resetPreviousMatches !== false; // Default to true

    // Add validation
    if (config.timestampToleranceSeconds < 0) {
      throw new Error("timestampToleranceSeconds must be positive");
    }

    if (config.quantityTolerancePct < 0 || config.quantityTolerancePct > 100) {
      throw new Error("quantityTolerancePct must be between 0 and 100");
    }

    const reconciliationRun = new ReconciliationRun({
      runId,
      startedAt: new Date(),
      status: "running",
      config: {
        timestampToleranceSeconds: config.timestampToleranceSeconds,
        quantityTolerancePct: config.quantityTolerancePct,
        resetPreviousMatches: shouldReset, // Store in run
      },
      summary: {
        matched: 0,
        conflicting: 0,
        unmatchedUser: 0,
        unmatchedExchange: 0,
        totalUserTransactions: 0,
        totalExchangeTransactions: 0,
        totalValidUserTransactions: 0,
        totalValidExchangeTransactions: 0,
      },
      matches: [],
      unmatchedUserIds: [],
      unmatchedExchangeIds: [],
    });

    await reconciliationRun.save();

    // Run matching asynchronously
    this.processReconciliation(
      reconciliationRun._id.toString(),
      config,
      shouldReset
    ).catch((error) => {
      logger.error(`Reconciliation ${runId} failed:`, error);
    });

    return reconciliationRun;
  }

  /**
   * Process reconciliation (matching logic)
   */
  private static async processReconciliation(
    runId: string,
    config: ReconciliationConfig,
    resetPreviousMatches: boolean = true
  ) {
    try {
      if (resetPreviousMatches) {
        // Reset all matched flags
        await Transaction.updateMany(
          { source: "user" },
          { isMatched: false, matchedWith: null }
        );
        await Transaction.updateMany(
          { source: "exchange" },
          { isMatched: false, matchedWith: null }
        );
        logger.info("Reset previous matches before reconciliation");
      }

      // Get counts
      const totalUserTransactions = await Transaction.countDocuments({
        source: "user",
      });
      const totalExchangeTransactions = await Transaction.countDocuments({
        source: "exchange",
      });
      const totalValidUserTransactions = await Transaction.countDocuments({
        source: "user",
        isValid: true,
      });
      const totalValidExchangeTransactions = await Transaction.countDocuments({
        source: "exchange",
        isValid: true,
      });

      // Run matching
      const { matches, unmatchedUserIds, unmatchedExchangeIds } =
        await MatchingService.runMatching(runId, config);

      // Separate perfect and conflicting matches
      const perfectMatches = matches.filter((m) => !m.isConflicting);
      const conflictingMatches = matches.filter((m) => m.isConflicting);

      // Update reconciliation run
      await ReconciliationRun.findByIdAndUpdate(runId, {
        status: "completed",
        completedAt: new Date(),
        summary: {
          matched: perfectMatches.length,
          conflicting: conflictingMatches.length,
          unmatchedUser: unmatchedUserIds.length,
          unmatchedExchange: unmatchedExchangeIds.length,
          totalUserTransactions,
          totalExchangeTransactions,
          totalValidUserTransactions,
          totalValidExchangeTransactions,
        },
        matches: matches,
        unmatchedUserIds,
        unmatchedExchangeIds,
      });

      logger.info(`Reconciliation ${runId} completed successfully`);
    } catch (error) {
      logger.error(`Reconciliation ${runId} failed:`, error);
      await ReconciliationRun.findByIdAndUpdate(runId, {
        status: "failed",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Get reconciliation run by ID
   */
  static async getReconciliationRun(
    runId: string
  ): Promise<IReconciliationRun | null> {
    return await ReconciliationRun.findOne({ runId });
  }

  /**
   * Get all reconciliation runs
   */
  static async getAllRuns(): Promise<IReconciliationRun[]> {
    return await ReconciliationRun.find().sort({ createdAt: -1 });
  }
}
