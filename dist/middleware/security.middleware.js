import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import compression from "compression";
import { logger } from "../utils/logger.js";
// Helper function to get client IP
const getClientIp = (req) => {
    const xForwardedFor = req.headers["x-forwarded-for"];
    if (xForwardedFor && typeof xForwardedFor === "string") {
        return xForwardedFor.split(",")[0].trim();
    }
    return req.ip || req.socket.remoteAddress || "unknown";
};
// Rate limiting
export const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: {
        error: "Too many requests",
        message: "Please try again after 15 minutes",
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    skip: (req) => req.path === "/health",
});
export const reconciliationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: {
        error: "Too many reconciliation requests",
        message: "Please wait before starting another reconciliation run",
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
});
// Security headers
export const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
});
// CORS options
export const corsOptions = {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition"],
    credentials: false,
    optionsSuccessStatus: 200,
};
// Compression middleware
export const compress = compression({
    level: 6,
    threshold: 1024,
});
// Prevent MongoDB injection (fixed for Express 4)
export const sanitizeInput = mongoSanitize({
    replaceWith: "_",
    onSanitize: ({ req, key }) => {
        if (process.env.NODE_ENV === "development") {
            logger.debug(`Sanitized input field: ${key}`);
        }
    },
});
// Prevent HTTP Parameter Pollution
export const preventParameterPollution = hpp();
// Request logging
export const requestLogger = (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? "warn" : "info";
        logger[logLevel](`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    });
    next();
};
// Error handler
export const errorHandler = (err, req, res, next) => {
    logger.error("Error:", {
        message: err.message,
        path: req.path,
        method: req.method,
    });
    if (err.name === "ValidationError") {
        return res.status(400).json({
            error: "Validation Error",
            message: err.message,
            timestamp: new Date().toISOString(),
        });
    }
    if (err.code === 11000) {
        return res.status(409).json({
            error: "Duplicate Error",
            message: "A record with this identifier already exists",
            timestamp: new Date().toISOString(),
        });
    }
    const status = err.status || 500;
    const message = process.env.NODE_ENV === "production" && status === 500
        ? "An unexpected error occurred"
        : err.message;
    res.status(status).json({
        error: err.name || "Internal Server Error",
        message,
        timestamp: new Date().toISOString(),
    });
};
// 404 handler
export const notFoundHandler = (req, res) => {
    res.status(404).json({
        error: "Not Found",
        message: `Cannot ${req.method} ${req.path}`,
        timestamp: new Date().toISOString(),
    });
};
// Usage tracker
export const usageTracker = (req, res, next) => {
    if (process.env.NODE_ENV === "production") {
        logger.debug(`API Call: ${req.method} ${req.path}`);
    }
    next();
};
