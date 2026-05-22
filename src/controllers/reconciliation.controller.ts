import { Request, Response } from "express";
import { ReconciliationService } from "../services/reconciliation.service.js";
import { Transaction } from "../models/Transaction.model.js";
import { logger } from "../utils/logger.js";
import { parse } from "json2csv";

export class ReconciliationController {
  /**
   * @swagger
   * /reconcile:
   *   post:
   *     summary: Start a new reconciliation run
   *     tags: [Reconciliation]
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ReconciliationRequest'
   *     responses:
   *       202:
   *         description: Reconciliation started successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ReconciliationResponse'
   *       400:
   *         description: Invalid request parameters
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       429:
   *         description: Too many requests
   *       500:
   *         description: Internal server error
   */
  static async startReconciliation(req: Request, res: Response) {
    try {
      const config = {
        timestampToleranceSeconds:
          req.body?.timestampToleranceSeconds ||
          parseInt(process.env.TIMESTAMP_TOLERANCE_SECONDS || "300"),
        quantityTolerancePct:
          req.body?.quantityTolerancePct ||
          parseFloat(process.env.QUANTITY_TOLERANCE_PCT || "0.01"),
        resetPreviousMatches: req.body?.resetPreviousMatches !== false, // Allow override
      };

      const run = await ReconciliationService.startReconciliation(config);

      res.status(202).json({
        success: true,
        message: "Reconciliation started",
        runId: run.runId,
        status: run.status,
        config: run.config,
      });
    } catch (error) {
      logger.error("Failed to start reconciliation:", error);
      res.status(500).json({
        error: "Failed to start reconciliation",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * @swagger
   * /report/{runId}:
   *   get:
   *     summary: Get full reconciliation report
   *     tags: [Reports]
   *     parameters:
   *       - $ref: '#/components/parameters/runIdParam'
   *       - in: query
   *         name: format
   *         schema:
   *           type: string
   *           enum: [json, csv]
   *           default: json
   *         description: Response format
   *     responses:
   *       200:
   *         description: Report generated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *           text/csv:
   *             schema:
   *               type: string
   *       404:
   *         description: Reconciliation run not found
   *       500:
   *         description: Internal server error
   */
  static async getFullReport(req: Request, res: Response) {
    try {
      let runId = req.params.runId;
      if (Array.isArray(runId)) {
        runId = runId[0]; // take the first element
      }
      if (!runId) {
        return res.status(400).json({ error: "runId required" });
      }
      const format = (req.query.format as string) || "json";

      const run = await ReconciliationService.getReconciliationRun(runId);

      if (!run) {
        return res.status(404).json({ error: "Reconciliation run not found" });
      }

      // Build report entries
      const reportEntries = [];

      // Matched and Conflicting entries
      for (const match of run.matches) {
        const userTx = await Transaction.findById(match.userTransactionId);
        const exchangeTx = await Transaction.findById(
          match.exchangeTransactionId
        );

        reportEntries.push({
          category: match.isConflicting ? "conflicting" : "matched",
          reason: match.isConflicting
            ? match.conflictReason || "Fields outside tolerance"
            : "Successfully matched",
          userTransaction: userTx?.originalRow,
          exchangeTransaction: exchangeTx?.originalRow,
          matchDetails: {
            score: match.matchScore,
            timestampDiff: match.timestampDiff,
            quantityDiff: match.quantityDiff,
          },
        });
      }

      // Unmatched User entries
      for (const userId of run.unmatchedUserIds) {
        const userTx = await Transaction.findById(userId);
        reportEntries.push({
          category: "unmatched_user",
          reason: "No matching transaction found in exchange data",
          userTransaction: userTx?.originalRow,
          exchangeTransaction: null,
        });
      }

      // Unmatched Exchange entries
      for (const exchangeId of run.unmatchedExchangeIds) {
        const exchangeTx = await Transaction.findById(exchangeId);
        reportEntries.push({
          category: "unmatched_exchange",
          reason: "No matching transaction found in user data",
          userTransaction: null,
          exchangeTransaction: exchangeTx?.originalRow,
        });
      }

      if (format === "csv") {
        const csv = parse(reportEntries);
        res.header("Content-Type", "text/csv");
        res.attachment(`reconciliation_${runId}.csv`);
        return res.send(csv);
      }

      res.json({
        runId: run.runId,
        summary: run.summary,
        config: run.config,
        report: reportEntries,
      });
    } catch (error) {
      logger.error("Failed to generate report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  }

  /**
   * @swagger
   * /report/{runId}/summary:
   *   get:
   *     summary: Get reconciliation summary statistics
   *     tags: [Reports]
   *     parameters:
   *       - $ref: '#/components/parameters/runIdParam'
   *     responses:
   *       200:
   *         description: Summary retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SummaryResponse'
   *       404:
   *         description: Reconciliation run not found
   */
  static async getSummary(req: Request, res: Response) {
    try {
      let { runId } = req.params;
      if (Array.isArray(runId)) {
        runId = runId[0]; // take the first element
      }
      if (!runId) {
        return res.status(400).json({ error: "runId required" });
      }
      const run = await ReconciliationService.getReconciliationRun(runId);

      if (!run) {
        return res.status(404).json({ error: "Reconciliation run not found" });
      }

      res.json({
        runId: run.runId,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        config: run.config,
        summary: run.summary,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get summary" });
    }
  }

  /**
   * @swagger
   * /report/{runId}/unmatched:
   *   get:
   *     summary: Get unmatched transactions only
   *     tags: [Reports]
   *     parameters:
   *       - $ref: '#/components/parameters/runIdParam'
   *     responses:
   *       200:
   *         description: Unmatched transactions retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 runId:
   *                   type: string
   *                 totalUnmatched:
   *                   type: number
   *                 unmatched:
   *                   type: array
   *       404:
   *         description: Reconciliation run not found
   */
  static async getUnmatched(req: Request, res: Response) {
    try {
      let { runId } = req.params;
      if (Array.isArray(runId)) {
        runId = runId[0]; // take the first element
      }
      if (!runId) {
        return res.status(400).json({ error: "runId required" });
      }
      const run = await ReconciliationService.getReconciliationRun(runId);

      if (!run) {
        return res.status(404).json({ error: "Reconciliation run not found" });
      }

      const unmatched = [];

      for (const userId of run.unmatchedUserIds) {
        const userTx = await Transaction.findById(userId);
        unmatched.push({
          category: "unmatched_user",
          reason: "No matching transaction found in exchange data",
          transaction: userTx?.originalRow,
          qualityIssues: userTx?.dataQualityIssues,
        });
      }

      for (const exchangeId of run.unmatchedExchangeIds) {
        const exchangeTx = await Transaction.findById(exchangeId);
        unmatched.push({
          category: "unmatched_exchange",
          reason: "No matching transaction found in user data",
          transaction: exchangeTx?.originalRow,
          qualityIssues: exchangeTx?.dataQualityIssues,
        });
      }

      res.json({
        runId: run.runId,
        totalUnmatched:
          run.summary.unmatchedUser + run.summary.unmatchedExchange,
        unmatched,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get unmatched transactions" });
    }
  }
}
