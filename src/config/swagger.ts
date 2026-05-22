import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
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
        url: "https://your-railway-app.up.railway.app/api",
        description: "Production server",
      },
    ],
    components: {
      schemas: {
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
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
      },
      parameters: {
        runIdParam: {
          name: "runId",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Reconciliation run ID",
          example: "rec_1700000000_abc123",
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
