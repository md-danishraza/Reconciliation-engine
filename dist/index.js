import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import reconciliationRoutes from "./routes/reconciliation.routes.js";
import docsRoutes from "./routes/docs.routes.js";
import { securityHeaders, corsOptions, limiter, reconciliationLimiter, preventParameterPollution, compress, requestLogger, errorHandler, notFoundHandler, usageTracker, } from "./middleware/security.middleware.js";
dotenv.config();
const app = express();
// Security & Performance middleware (order matters!)
app.use(compress);
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(preventParameterPollution);
app.use(requestLogger);
app.use(usageTracker);
// Apply rate limiting to all routes (except health)
app.use("/api", limiter);
app.use("/api/reconcile", reconciliationLimiter);
// Health check (no rate limiting, no auth)
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        environment: config.nodeEnv,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: "1.0.0",
    });
});
// Simple root endpoint
app.get("/", (req, res) => {
    res.json({
        name: "Transaction Reconciliation Engine",
        version: "1.0.0",
        documentation: "/docs",
        health: "/health",
        endpoints: {
            reconcile: "POST /api/reconcile",
            report: "GET /api/report/:runId",
            summary: "GET /api/report/:runId/summary",
            unmatched: "GET /api/report/:runId/unmatched",
        },
    });
});
// API Documentation (public)
app.use("/docs", docsRoutes);
// API Routes with validation
app.use("/api", reconciliationRoutes);
// 404 handler (must come after all routes)
app.use(notFoundHandler);
// Global error handler (must be last)
app.use(errorHandler);
const startServer = async () => {
    try {
        await connectDB();
        const server = app.listen(config.port, () => {
            logger.info(`🚀 Server running on port ${config.port}`);
            logger.info(`📚 API Documentation: http://localhost:${config.port}/docs`);
            logger.info(`🌍 Environment: ${config.nodeEnv}`);
            logger.info(`🔓 CORS: Enabled for all origins (public API)`);
            logger.info(`🔄 Reconciliation defaults: ±${config.reconciliation.defaultTimestampTolerance}s, ±${config.reconciliation.defaultQuantityTolerance}%`);
        });
        // Graceful shutdown
        const gracefulShutdown = async () => {
            logger.info("Received shutdown signal, closing gracefully...");
            server.close(async () => {
                logger.info("HTTP server closed");
                process.exit(0);
            });
            setTimeout(() => {
                logger.error("Could not close connections in time, forcefully shutting down");
                process.exit(1);
            }, 10000);
        };
        process.on("SIGTERM", gracefulShutdown);
        process.on("SIGINT", gracefulShutdown);
    }
    catch (error) {
        logger.error("Failed to start server:", error);
        process.exit(1);
    }
};
startServer();
export default app;
