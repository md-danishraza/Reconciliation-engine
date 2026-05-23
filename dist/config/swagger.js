import swaggerJsdoc from "swagger-jsdoc";
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Transaction Reconciliation Engine API",
      version: "1.0.0",
      description: `
        A robust transaction reconciliation engine that matches user-exported and exchange-exported transaction data.
        
        ## Features
        - CSV ingestion with data quality validation
        - Smart matching with configurable tolerances
        - Asset alias and type perspective handling
        - Multiple report formats (JSON/CSV)
        - Async reconciliation processing
        
        ## Rate Limits
        - 200 requests per 15 minutes for general endpoints
        - 20 reconciliation runs per hour for /reconcile endpoint
        
        ## Public API
        This API is publicly accessible with rate limiting for fair usage.
      `,
      contact: {
        name: "API Support",
        email: "support@reconciliation.com",
      },
      license: {
        name: "ISC",
      },
    },
    servers: [
      {
        url: "http://localhost:3000/api",
        description: "Development server",
      },
      {
        url: "https://reconciliation-engine-oxed.onrender.com/api",
        description: "Production server",
      },
    ],
    components: {
      schemas: {
        // Request Schemas
        ReconciliationRequest: {
          type: "object",
          properties: {
            timestampToleranceSeconds: {
              type: "number",
              default: 300,
              minimum: 0,
              maximum: 86400,
              description: "Maximum allowed time difference in seconds",
              example: 300,
            },
            quantityTolerancePct: {
              type: "number",
              default: 0.01,
              minimum: 0,
              maximum: 100,
              description: "Maximum allowed quantity difference percentage",
              example: 0.01,
            },
            resetPreviousMatches: {
              type: "boolean",
              default: true,
              description: "Whether to clear existing matches before running",
              example: true,
            },
          },
        },
        // Response Schemas
        ReconciliationResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Reconciliation started" },
            runId: { type: "string", example: "rec_1700000000_abc123" },
            status: {
              type: "string",
              enum: ["pending", "running", "completed", "failed"],
              example: "running",
            },
            config: {
              type: "object",
              properties: {
                timestampToleranceSeconds: { type: "number", example: 300 },
                quantityTolerancePct: { type: "number", example: 0.01 },
              },
            },
          },
        },
        // Summary Response Schema - FIXED
        SummaryResponse: {
          type: "object",
          properties: {
            runId: { type: "string", example: "rec_1700000000_abc123" },
            status: {
              type: "string",
              enum: ["pending", "running", "completed", "failed"],
              example: "completed",
            },
            startedAt: {
              type: "string",
              format: "date-time",
              example: "2024-01-01T00:00:00Z",
            },
            completedAt: {
              type: "string",
              format: "date-time",
              example: "2024-01-01T00:01:00Z",
            },
            config: {
              type: "object",
              properties: {
                timestampToleranceSeconds: { type: "number", example: 300 },
                quantityTolerancePct: { type: "number", example: 0.01 },
              },
            },
            summary: {
              type: "object",
              properties: {
                matched: { type: "number", example: 18 },
                conflicting: { type: "number", example: 2 },
                unmatchedUser: { type: "number", example: 3 },
                unmatchedExchange: { type: "number", example: 2 },
                totalUserTransactions: { type: "number", example: 25 },
                totalExchangeTransactions: { type: "number", example: 25 },
                totalValidUserTransactions: { type: "number", example: 22 },
                totalValidExchangeTransactions: { type: "number", example: 25 },
              },
            },
          },
        },
        // Full Report Response Schema
        ReportResponse: {
          type: "object",
          properties: {
            runId: { type: "string" },
            summary: { $ref: "#/components/schemas/ReportSummary" },
            config: { $ref: "#/components/schemas/ReconciliationConfig" },
            report: {
              type: "array",
              items: { $ref: "#/components/schemas/ReportEntry" },
            },
          },
        },
        ReportSummary: {
          type: "object",
          properties: {
            matched: { type: "number" },
            conflicting: { type: "number" },
            unmatchedUser: { type: "number" },
            unmatchedExchange: { type: "number" },
            totalUserTransactions: { type: "number" },
            totalExchangeTransactions: { type: "number" },
          },
        },
        ReconciliationConfig: {
          type: "object",
          properties: {
            timestampToleranceSeconds: { type: "number" },
            quantityTolerancePct: { type: "number" },
            resetPrevious: { type: "boolean" },
          },
        },
        ReportEntry: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [
                "matched",
                "conflicting",
                "unmatched_user",
                "unmatched_exchange",
              ],
            },
            reason: { type: "string" },
            userTransaction: {
              type: "object",
              nullable: true,
            },
            exchangeTransaction: {
              type: "object",
              nullable: true,
            },
            matchDetails: {
              type: "object",
              properties: {
                score: { type: "number" },
                timestampDiff: { type: "number" },
                quantityDiff: { type: "number" },
              },
            },
          },
        },
        // Unmatched Response Schema
        UnmatchedResponse: {
          type: "object",
          properties: {
            runId: { type: "string" },
            totalUnmatched: { type: "number" },
            unmatched: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["unmatched_user", "unmatched_exchange"],
                  },
                  reason: { type: "string" },
                  transaction: { type: "object" },
                  qualityIssues: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
          },
        },
        // Error Response Schema
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string", example: "Validation Error" },
            message: { type: "string", example: "Invalid request parameters" },
            timestamp: { type: "string", format: "date-time" },
            details: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        // Health Response Schema
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ok"], example: "ok" },
            timestamp: { type: "string", format: "date-time" },
            environment: {
              type: "string",
              enum: ["development", "production"],
              example: "development",
            },
            uptime: { type: "number", example: 123.45 },
            version: { type: "string", example: "1.0.0" },
          },
        },
      },
      parameters: {
        runIdParam: {
          name: "runId",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Reconciliation run ID (format: rec_timestamp_uuid)",
          example: "rec_1700000000_abc123",
        },
        formatParam: {
          name: "format",
          in: "query",
          schema: {
            type: "string",
            enum: ["json", "csv"],
            default: "json",
          },
          description: "Response format",
        },
      },
      responses: {
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        ValidationError: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        RateLimitError: {
          description: "Rate limit exceeded",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Reconciliation",
        description: "Endpoints for triggering and managing reconciliation",
      },
      {
        name: "Reports",
        description: "Endpoints for fetching reconciliation reports",
      },
      {
        name: "Health",
        description: "Health check endpoints",
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts"],
};
export const swaggerSpec = swaggerJsdoc(options);
