# Transaction Reconciliation Engine

A robust backend service that reconciles transaction data between user-exported CSVs and exchange-exported CSVs, handling messy real-world data with configurable matching tolerances.

## Features

- **CSV Ingestion** with data quality validation and logging
- **Intelligent Matching** with configurable timestamp, quantity, and type tolerances
- **Reconciliation Reports** categorized as Matched, Conflicting, and Unmatched
- **Asset Alias Handling** (BTC = Bitcoin, USDT = Tether, etc.)
- **Type Mapping** for opposite perspective transactions
- **Runtime Configuration** without code changes
- **MongoDB Atlas** for persistent storage

## Tech Stack

- Node.js + Express (TypeScript)
- MongoDB Atlas + Mongoose ODM
- CSV parsing with error handling
- RESTful API with Swagger documentation

## Prerequisites

- Node.js v20+
- MongoDB Atlas account
- npm

## Setup Instructions

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/md-danishraza/Reconciliation-engine
npm install
```
