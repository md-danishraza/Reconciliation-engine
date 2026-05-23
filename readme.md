# Transaction Reconciliation Engine

[![Deployed on Render](https://img.shields.io/badge/Deployed%20on-Render-46E3B7?logo=render&logoColor=white)](https://reconciliation-engine-oxed.onrender.com)
[![Node Version](https://img.shields.io/badge/Node-18.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)

A robust backend service that reconciles transaction data between user-exported CSVs and exchange-exported CSVs, handling messy real-world data with configurable matching tolerances.

## 🚀 Live Demo

**API Base URL:** `https://reconciliation-engine-oxed.onrender.com`

- 📚 **Swagger Documentation:** [https://reconciliation-engine-oxed.onrender.com/docs](https://reconciliation-engine-oxed.onrender.com/docs)
- ✅ **Health Check:** [https://reconciliation-engine-oxed.onrender.com/health](https://reconciliation-engine-oxed.onrender.com/health)

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [API Endpoints](#api-endpoints)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Data Matching Logic](#data-matching-logic)
- [Project Structure](#project-structure)
- [API Examples](#api-examples)
- [Troubleshooting](#troubleshooting)

## ✨ Features

### Core Functionality

- 📊 **CSV Ingestion** - Parse and validate CSV files with data quality checks
- 🎯 **Intelligent Matching** - Score-based matching with configurable tolerances
- 📝 **Reconciliation Reports** - Categorized as Matched, Conflicting, and Unmatched
- 🔄 **CSV Export** - Download reports in CSV format

### Smart Handling

- 🔄 **Asset Aliases** - Automatically maps "bitcoin" → "BTC", "ethereum" → "ETH"
- 🔀 **Type Mapping** - Handles opposite perspectives (TRANSFER_OUT ↔ TRANSFER_IN)
- ⚠️ **Quality Tracking** - Flags malformed data without losing information
- 🔍 **Duplicate Detection** - Prevents duplicate transaction imports

### Production Ready

- ⚙️ **Runtime Configuration** - Adjust matching tolerances without code changes
- 🚦 **Rate Limiting** - 200 req/15min, 20 reconciliations/hour
- 📚 **Swagger Documentation** - Interactive API documentation
- 🔒 **Security Headers** - Helmet.js for XSS and clickjacking protection

## 🛠 Tech Stack

| Category          | Technologies                 |
| ----------------- | ---------------------------- |
| **Runtime**       | Node.js 18.x                 |
| **Language**      | TypeScript 5.2               |
| **Framework**     | Express 4.18                 |
| **Database**      | MongoDB Atlas + Mongoose 7.8 |
| **Validation**    | Zod 3.22                     |
| **Documentation** | Swagger UI + OpenAPI 3.0     |
| **Security**      | Helmet, CORS, Rate Limiting  |
| **Deployment**    | Render                       |

## 📡 API Endpoints

| Method | Endpoint                       | Description                               |
| ------ | ------------------------------ | ----------------------------------------- |
| `POST` | `/api/reconcile`               | Start a new reconciliation run            |
| `GET`  | `/api/report/:runId`           | Get full reconciliation report (JSON/CSV) |
| `GET`  | `/api/report/:runId/summary`   | Get summary statistics                    |
| `GET`  | `/api/report/:runId/unmatched` | Get unmatched transactions only           |
| `GET`  | `/health`                      | Health check endpoint                     |
| `GET`  | `/docs`                        | Swagger UI documentation                  |

### Response Categories

| Category                 | Description                                      |
| ------------------------ | ------------------------------------------------ |
| **Matched**              | Successfully paired within configured tolerances |
| **Conflicting**          | Matched but fields differ beyond tolerance       |
| **Unmatched (User)**     | Present in user file, not found in exchange      |
| **Unmatched (Exchange)** | Present in exchange file, not found in user      |

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or higher
- MongoDB Atlas account (or local MongoDB)
- npm 9.x or higher

### Local Development

```bash
# Clone the repository
git clone https://github.com/md-danishraza/Reconciliation-engine
cd Reconciliation-engine

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your MongoDB URI

# Build TypeScript
npm run build

# Seed the database with sample data
npm run seed

# Start development server
npm run dev

# Or start production server
npm start
```

### ⚙️ Configuration

#### Matching Tolerances

You can override defaults per request:

```json
{
  "timestampToleranceSeconds": 600, // Time window in seconds (default: 300)
  "quantityTolerancePct": 0.05, // Quantity tolerance % (default: 0.01)
  "resetPreviousMatches": true // Clear existing matches (default: true)
}
```

### Asset Alias Mapping

| User Input        | Normalized To |
| ----------------- | ------------- |
| bitcoin, BTC, xbt | BTC           |
| ethereum, ETH     | ETH           |
| tether, USDT      | USDT          |
| solana, SOL       | SOL           |

### Type Perspective Mapping

| User Type    | Exchange Type |
| ------------ | ------------- |
| TRANSFER_OUT | TRANSFER_IN   |
| WITHDRAWAL   | TRANSFER_IN   |
| DEPOSIT      | TRANSFER_OUT  |
| PURCHASE     | BUY           |
| SALE         | SELL          |

### 🧠 Data Matching Logic

The engine uses a score-based matching algorithm:

```text
Match Score = Timestamp Score (40%) + Quantity Score (40%) + Type Score (20%)

- Timestamp Score: Linear decay from 0.4 to 0 within tolerance window
- Quantity Score: Linear decay from 0.4 to 0 within tolerance %
- Type Score: 0.2 if types match
```

### Matching Process

- Asset normalization ("bitcoin" → "BTC")

- Type mapping (TRANSFER_OUT → TRANSFER_IN)

- Score calculation for all potential matches

- Greedy selection of best match (>0.6 score)

- Conflict detection for matches outside tolerances

## 📁 Project Structure

```
ReconciliationEngine/
├── src/
│   ├── config/           # App configuration
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Security & validation
│   ├── models/           # Mongoose schemas
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── types/            # TypeScript interfaces
│   └── utils/            # Helpers & utilities
├── datasets/             # Sample CSV files
├── dist/                 # Compiled JavaScript
├── .env                  # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## 📝 API Examples

### Start Reconciliation

```bash
curl -X POST https://reconciliation-engine-oxed.onrender.com/api/reconcile \
  -H "Content-Type: application/json" \
  -d '{
    "timestampToleranceSeconds": 300,
    "quantityTolerancePct": 0.01,
    "resetPreviousMatches": true
  }'


Response:

json
{
  "success": true,
  "message": "Reconciliation started",
  "runId": "rec_1700000000_abc123",
  "status": "running",
  "config": {
    "timestampToleranceSeconds": 300,
    "quantityTolerancePct": 0.01
  }
}
```

### Get Summary Report

```bash
curl https://reconciliation-engine-oxed.onrender.com/api/report/rec_1700000000_abc123/summary

Response:

json
{
  "runId": "rec_1700000000_abc123",
  "status": "completed",
  "summary": {
    "matched": 18,
    "conflicting": 2,
    "unmatchedUser": 3,
    "unmatchedExchange": 2
  }
}

```

### Export CSV Report

```bash
curl https://reconciliation-engine-oxed.onrender.com/api/report/rec_1700000000_abc123?format=csv \

  --output report.csv
```

## Getting Help

- 📚 **Check API docs:** `/docs` endpoint
- 📊 **Monitor logs:** Render dashboard
- 🐛 **Verify data:** Run `npm run test-ingestion`

## License

ISC License — See LICENSE file for details

## Author

👨‍💻 Md Danish Raza  
GitHub: [@md-danishraza](https://github.com/md-danishraza)

## Acknowledgments

🙏 Built for backend intern assignment  
💡 Inspired by real-world crypto transaction reconciliation challenges

⭐ Star this repository if you found it useful!

## Live API

[https://reconciliation-engine-oxed.onrender.com](https://reconciliation-engine-oxed.onrender.com)
