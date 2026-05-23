import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import hpp from "hpp";
import compression from "compression";
import { logger } from "../utils/logger.js";

// Helper function to get client IP (works with IPv4 and IPv6)
const getClientIp = (req: Request): string => {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (xForwardedFor && typeof xForwardedFor === "string") {
    return xForwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
};

// Rate limiting - Fixed IPv6 issue
export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: {
    error: "Too many requests",
    message: "Please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use the helper function for proper IP handling
    return getClientIp(req);
  },
  skip: (req: Request) => {
    return req.path === "/health";
  },
});

// Stricter rate limit for reconciliation endpoint
export const reconciliationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    error: "Too many reconciliation requests",
    message: "Please wait before starting another reconciliation run",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return getClientIp(req);
  },
});

// Security headers with helmet
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

// Open CORS for public API
export const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition"],
  credentials: false,
  optionsSuccessStatus: 200,
  preflightContinue: false,
  maxAge: 86400,
};

// Prevent HTTP Parameter Pollution
export const preventParameterPollution = hpp();

// Compression for faster responses
export const compress = compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers["accept"] === "text/event-stream") {
      return false;
    }
    return compression.filter(req, res);
  },
});

// Request logging middleware
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? "warn" : "info";

    logger[logLevel](
      `${req.method} ${req.path} - ${
        res.statusCode
      } - ${duration}ms - IP: ${getClientIp(req)}`
    );
  });

  next();
};

// Error handling middleware
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error("Error:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Mongoose validation error
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation Error",
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({
      error: "Duplicate Error",
      message: "A record with this identifier already exists",
      timestamp: new Date().toISOString(),
    });
  }

  // Rate limit error
  if (err.name === "RateLimitError") {
    return res.status(429).json({
      error: "Rate Limit Exceeded",
      message: "Too many requests, please try again later",
      timestamp: new Date().toISOString(),
    });
  }

  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === "production" && status === 500
      ? "An unexpected error occurred"
      : err.message;

  res.status(status).json({
    error: err.name || "Internal Server Error",
    message,
    timestamp: new Date().toISOString(),
  });
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
};

// Usage tracker
export const usageTracker = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (process.env.NODE_ENV === "production") {
    logger.debug(`API Call: ${req.method} ${req.path}`);
  }
  next();
};
