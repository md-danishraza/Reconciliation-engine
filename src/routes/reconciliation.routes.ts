import { Router } from "express";
import { ReconciliationController } from "../controllers/reconciliation.controller.js";

const router = Router();

router.post("/reconcile", ReconciliationController.startReconciliation);
router.get("/report/:runId", ReconciliationController.getFullReport);
router.get("/report/:runId/summary", ReconciliationController.getSummary);
router.get("/report/:runId/unmatched", ReconciliationController.getUnmatched);

export default router;
