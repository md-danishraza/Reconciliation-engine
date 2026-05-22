import { Transaction, ITransaction } from "../models/Transaction.model.js";
import { logger } from "../utils/logger.js";
import mongoose from "mongoose";

export interface MatchCandidate {
  userTransaction: ITransaction;
  exchangeTransaction: ITransaction;
  score: number;
  timestampDiffSeconds: number;
  quantityDiffPercent: number;
  typeMatch: boolean;
  assetMatch: boolean;
}

export interface MatchResult {
  userTransactionId: mongoose.Types.ObjectId;
  exchangeTransactionId: mongoose.Types.ObjectId;
  matchScore: number;
  isConflicting: boolean;
  conflictReason?: string;
  timestampDiff?: number;
  quantityDiff?: number;
}

export class MatchingService {
  /**
   * Calculate match score between user and exchange transaction
   * Score range: 0 (no match) to 1 (perfect match)
   */
  static calculateMatchScore(
    userTx: ITransaction,
    exchangeTx: ITransaction,
    config: { timestampToleranceSeconds: number; quantityTolerancePct: number }
  ): MatchCandidate | null {
    // 1. Asset must match (already normalized)
    if (userTx.normalizedAsset !== exchangeTx.normalizedAsset) {
      return null;
    }

    // 2. Type must match (already normalized)
    if (userTx.normalizedType !== exchangeTx.normalizedType) {
      return null;
    }

    // 3. Calculate timestamp difference
    if (!userTx.timestamp || !exchangeTx.timestamp) {
      return null; // Can't match without timestamps
    }

    const timestampDiffSeconds =
      Math.abs(userTx.timestamp.getTime() - exchangeTx.timestamp.getTime()) /
      1000;

    // Check if within tolerance
    const isTimestampWithinTolerance =
      timestampDiffSeconds <= config.timestampToleranceSeconds;

    // 4. Calculate quantity difference percentage
    const quantityDiffPercent = Math.abs(
      ((userTx.quantity - exchangeTx.quantity) / exchangeTx.quantity) * 100
    );

    // Check if within tolerance
    const isQuantityWithinTolerance =
      quantityDiffPercent <= config.quantityTolerancePct;

    // 5. Calculate match score
    let score = 0;

    // Timestamp score (0-0.4 points)
    if (isTimestampWithinTolerance) {
      // Within tolerance: score decreases linearly from 0.4 to 0
      score +=
        0.4 * (1 - timestampDiffSeconds / config.timestampToleranceSeconds);
    } else {
      // Outside tolerance but still possible for conflicting matches
      score +=
        0.1 *
        Math.max(
          0,
          1 - timestampDiffSeconds / (config.timestampToleranceSeconds * 10)
        );
    }

    // Quantity score (0-0.4 points)
    if (isQuantityWithinTolerance) {
      // Within tolerance: score decreases linearly from 0.4 to 0
      score += 0.4 * (1 - quantityDiffPercent / config.quantityTolerancePct);
    } else {
      // Outside tolerance: lower score
      score +=
        0.1 *
        Math.max(
          0,
          1 - quantityDiffPercent / (config.quantityTolerancePct * 10)
        );
    }

    // Exact type match already ensured (0.2 points)
    score += 0.2;

    return {
      userTransaction: userTx,
      exchangeTransaction: exchangeTx,
      score,
      timestampDiffSeconds,
      quantityDiffPercent,
      typeMatch: true,
      assetMatch: true,
    };
  }

  /**
   * Find best match for a user transaction from exchange transactions
   */
  static async findBestMatch(
    userTx: ITransaction,
    exchangeTransactions: ITransaction[],
    config: { timestampToleranceSeconds: number; quantityTolerancePct: number }
  ): Promise<MatchCandidate | null> {
    const candidates: MatchCandidate[] = [];

    for (const exchangeTx of exchangeTransactions) {
      // Skip if already matched
      if (exchangeTx.isMatched) continue;

      const match = this.calculateMatchScore(userTx, exchangeTx, config);
      if (match && match.score > 0.5) {
        // Only consider matches with score > 0.5
        candidates.push(match);
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by score (highest first) and return best match
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  /**
   * Determine if a match is conflicting (outside tolerances)
   */
  static isConflictingMatch(
    match: MatchCandidate,
    config: { timestampToleranceSeconds: number; quantityTolerancePct: number }
  ): { isConflicting: boolean; reason?: string } {
    const isTimestampOutside =
      match.timestampDiffSeconds > config.timestampToleranceSeconds;
    const isQuantityOutside =
      match.quantityDiffPercent > config.quantityTolerancePct;

    if (isTimestampOutside && isQuantityOutside) {
      return {
        isConflicting: true,
        reason: `Both timestamp (${match.timestampDiffSeconds}s) and quantity (${match.quantityDiffPercent}%) outside tolerances`,
      };
    } else if (isTimestampOutside) {
      return {
        isConflicting: true,
        reason: `Timestamp difference ${match.timestampDiffSeconds}s exceeds tolerance of ${config.timestampToleranceSeconds}s`,
      };
    } else if (isQuantityOutside) {
      return {
        isConflicting: true,
        reason: `Quantity difference ${match.quantityDiffPercent}% exceeds tolerance of ${config.quantityTolerancePct}%`,
      };
    }

    return { isConflicting: false };
  }

  /**
   * Run matching algorithm for all transactions
   */
  static async runMatching(
    runId: string,
    config: { timestampToleranceSeconds: number; quantityTolerancePct: number }
  ): Promise<{
    matches: MatchResult[];
    unmatchedUserIds: mongoose.Types.ObjectId[];
    unmatchedExchangeIds: mongoose.Types.ObjectId[];
  }> {
    logger.info(`Starting matching for run ${runId} with config:`, config);

    // Get all valid transactions (isValid = true)
    const userTransactions = await Transaction.find({
      source: "user",
      isValid: true,
      isMatched: false,
    }).sort({ timestamp: 1 });

    const exchangeTransactions = await Transaction.find({
      source: "exchange",
      isValid: true,
      isMatched: false,
    }).sort({ timestamp: 1 });

    logger.info(
      `Found ${userTransactions.length} user transactions and ${exchangeTransactions.length} exchange transactions to match`
    );

    const matches: MatchResult[] = [];
    const matchedUserIds = new Set<string>();
    const matchedExchangeIds = new Set<string>();

    // Greedy matching algorithm - match best candidates first
    for (const userTx of userTransactions) {
      if (matchedUserIds.has(userTx._id.toString())) continue;

      // Find best match
      const bestMatch = await this.findBestMatch(
        userTx,
        exchangeTransactions,
        config
      );

      if (bestMatch && bestMatch.score > 0.6) {
        // Check if this exchange transaction is already matched
        const exchangeId = bestMatch.exchangeTransaction._id.toString();

        if (!matchedExchangeIds.has(exchangeId)) {
          // Determine if conflicting
          const conflictCheck = this.isConflictingMatch(bestMatch, config);

          matches.push({
            userTransactionId: userTx._id,
            exchangeTransactionId: bestMatch.exchangeTransaction._id,
            matchScore: bestMatch.score,
            isConflicting: conflictCheck.isConflicting,
            conflictReason: conflictCheck.reason,
            timestampDiff: bestMatch.timestampDiffSeconds,
            quantityDiff: bestMatch.quantityDiffPercent,
          });

          matchedUserIds.add(userTx._id.toString());
          matchedExchangeIds.add(exchangeId);

          // Update transactions as matched
          await Transaction.findByIdAndUpdate(userTx._id, {
            isMatched: true,
            matchedWith: bestMatch.exchangeTransaction._id,
          });

          await Transaction.findByIdAndUpdate(
            bestMatch.exchangeTransaction._id,
            {
              isMatched: true,
              matchedWith: userTx._id,
            }
          );
        }
      }
    }

    // Get unmatched transactions
    const unmatchedUserIds = userTransactions
      .filter((tx) => !matchedUserIds.has(tx._id.toString()))
      .map((tx) => tx._id);

    const unmatchedExchangeIds = exchangeTransactions
      .filter((tx) => !matchedExchangeIds.has(tx._id.toString()))
      .map((tx) => tx._id);

    logger.info(
      `Matching completed: ${matches.length} matches, ${unmatchedUserIds.length} unmatched user, ${unmatchedExchangeIds.length} unmatched exchange`
    );

    // Separate conflicting matches
    const conflictingMatches = matches.filter((m) => m.isConflicting);
    const perfectMatches = matches.filter((m) => !m.isConflicting);

    logger.info(
      `Perfect matches: ${perfectMatches.length}, Conflicting matches: ${conflictingMatches.length}`
    );

    return {
      matches,
      unmatchedUserIds,
      unmatchedExchangeIds,
    };
  }
}
