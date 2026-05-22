import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import compression from "compression";
import { logger } from "../utils/logger.js";

// Rate limiting - Public API friendly
export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Increased to 200 requests per 15 minutes for public API
  message: {
    error: "Too many requests",
    message: "Please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use IP address for rate limiting
    return req.ip || (req.headers["x-forwarded-for"] as string) || "unknown";
  },
  skip: (req: Request) => {
    // Skip rate limiting for health check
    return req.path === "/health";
  },
});

// Stricter rate limit for reconciliation endpoint (expensive operation)
export const reconciliationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 reconciliations per hour max
  message: {
    error: "Too many reconciliation requests",
    message: "Please wait before starting another reconciliation run",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security headers with helmet (relaxed for public API)
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Needed for Swagger UI
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for Swagger UI
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow cross-origin for public API
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin requests
});

// Open CORS for public API
export const corsOptions = {
  origin: "*", // Allow all origins
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition"],
  credentials: false, // Set to false when origin is '*'
  optionsSuccessStatus: 200,
  preflightContinue: false,
  maxAge: 86400, // Cache preflight request for 24 hours
};

// Prevent MongoDB query injection
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

// Compression for faster responses
export const compress = compression({
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress event source responses
    if (req.headers["accept"] === "text/event-stream") {
      return false;
    }
    // Use default compression filter
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

  // Log when request completes
  res.on("finish", () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? "warn" : "info";

    logger[logLevel](
      `${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - IP: ${req.ip}`
    );
  });

  next();
};

// Error handling middleware (safe for production)
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log full error for debugging
  logger.error("Error:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
    ip: req.ip,
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

  // Default error (safe message for production)
  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === "production" && status === 500
      ? "An unexpected error occurred"
      : err.message;

  res.status(status).json({
    error: err.name || "Internal Server Error",
    message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === "development" && { path: req.path }),
  });
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response) => {
  logger.warn(
    `404 - Route not found: ${req.method} ${req.path} from IP: ${req.ip}`
  );
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
};

// Optional: Simple API usage tracking (no auth required)
export const usageTracker = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Track API usage (can be sent to analytics or just logged)
  if (process.env.NODE_ENV === "production") {
    // Log in production for monitoring
    logger.debug(`API Call: ${req.method} ${req.path} - IP: ${req.ip}`);
  }
  next();
};
