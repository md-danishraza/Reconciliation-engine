# Service Architecture

## Overview

The service layer is the core of the reconciliation engine, handling everything from CSV data ingestion to intelligent transaction matching. Each service has a specific responsibility, following the **Single Responsibility Principle (SRP)**.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Controllers)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Reconciliation Service                         │
│         (Orchestrates the entire reconciliation flow)         │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    Ingestion    │ │    Matching     │ │   Data Quality  │
│     Service     │ │     Service     │ │     Service     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Service Responsibilities

| Service | Primary Responsibility | Key Input | Key Output |
|---------|----------------------|-----------|------------|
| **Data Quality** | Validate and clean raw data | Raw CSV row | Validation result + cleaned data |
| **Ingestion** | Import CSV to database | CSV file path | Ingestion statistics |
| **Matching** | Find transaction pairs | User + exchange transactions | Match results with scores |
| **Reconciliation** | Orchestrate full flow | Config tolerances | Complete run with summary |

## Data Flow

```
CSV → DataQuality (validate) → Ingestion (save) → Database → 
Matching (find matches) → Reconciliation (store results) → API Response
```

---

## 1. Data Quality Service (`dataQuality.service.ts`)

### Purpose
Validates and cleans raw transaction data before database insertion. Ensures data integrity while preserving problematic records for audit.

### Core Responsibilities
- Validate timestamps, quantities, assets, and transaction types
- Detect duplicate transactions (exact and fuzzy matching)
- Classify issues by severity (error vs warning)
- Prepare cleaned data for database insertion

### Key Functions

#### `validateTransaction(row, source, rowNumber)`

**Purpose**: Comprehensive validation of a single transaction row

**Input**:
```typescript
row: {
  transaction_id: "USR-001",
  timestamp: "2024-03-01T09:00:00Z",
  type: "BUY",
  asset: "BTC",
  quantity: "0.5",
  price_usd: "62000.00",
  fee: "0.0005"
}
source: 'user' | 'exchange'
rowNumber: 19
```

**Validation Rules**:

| Field | Critical? | Validation Rules |
|-------|-----------|-----------------|
| `transaction_id` | ❌ | Warn if format mismatch (USR-* for user, EXC-* for exchange) |
| `timestamp` | ✅ | Must be valid ISO date, not empty |
| `type` | ✅ | Must not be empty |
| `asset` | ✅ | Must not be empty |
| `quantity` | ✅ | Must be positive number, not NaN |
| `price_usd` | ❌ | Warn if invalid format or negative |
| `fee` | ❌ | Warn if invalid format or negative |

**Severity Levels**:
```typescript
severity: 'error'   // Critical - transaction cannot be matched
severity: 'warning' // Minor - transaction can still be matched
```

**Critical Errors** (makes transaction `isValid = false`):
- Missing or invalid timestamp
- Missing or invalid quantity (non-positive)
- Missing type
- Missing asset

**Output**:
```typescript
{
  isValid: false,  // False if any critical error
  issues: [
    {
      row: 19,
      field: 'timestamp',
      issue: 'Invalid timestamp format: "2024-03-09T"',
      severity: 'error'
    }
  ],
  cleanedData: {
    source: 'user',
    transactionId: 'USR-018',
    timestamp: null,  // Invalid, set to null
    asset: 'ETH',
    quantity: 0.3,
    type: 'SELL',
    dataQualityIssues: ['timestamp: Invalid timestamp format (error)']
  }
}
```

#### `detectDuplicate(transactionId, timestamp, asset, quantity, existingTransactions)`

**Purpose**: Prevent duplicate transactions from being inserted

**Two-Level Detection**:

```typescript
// Level 1: Exact match by ID
if (transactionId && existingIds.has(transactionId)) {
  return true;  // Same transaction ID = definitely duplicate
}

// Level 2: Fuzzy match (same minute, same asset, same amount)
const timeDiff = Math.abs(existing.timestamp - timestamp);
const isSameAsset = existing.asset.toLowerCase() === asset.toLowerCase();
const isSameQuantity = Math.abs(existing.quantity - quantity) < 0.0001;

return timeDiff < 60000 && isSameAsset && isSameQuantity;
```

**Example**:
```javascript
// Detects these as duplicates:
User1: USR-001, BTC 0.5 @ 09:00:00
User2: USR-001, BTC 0.5 @ 09:00:01  // Same ID → duplicate

// Also detects:
User1: BTC 0.5 @ 09:00:00
User2: BTC 0.5 @ 09:00:30  // Same minute, amount → probable duplicate
```

---

## 2. Ingestion Service (`ingestion.service.ts`)

### Purpose
Orchestrates the complete CSV import process, from file reading to database storage.

### Core Responsibilities
- Parse CSV files using streaming parser
- Validate each row using DataQualityService
- Normalize assets and types for matching
- Store both valid and invalid transactions
- Track ingestion statistics

### Key Functions

#### `ingestFromCSV(filePath, source)`

**Purpose**: Complete ingestion pipeline for a CSV file

**Flow Diagram**:
```
CSV File → Parse CSV → Validate Row → Normalize → Check Duplicate → Save to DB
    │           │            │            │            │            │
    ▼           ▼            ▼            ▼            ▼            ▼
  26 rows    3 invalid    "bitcoin"→"BTC"   Skip dup    25 saved
            22 valid      "OUT"→"IN"                    (22 valid + 3 invalid)
```

**Normalization Process**:

```typescript
// Asset Normalization
normalizeAsset("bitcoin")  → "BTC"
normalizeAsset("BTC")      → "BTC"
normalizeAsset("ethereum") → "ETH"

// Type Normalization (User → Exchange perspective)
normalizeType("TRANSFER_OUT", "user") → "TRANSFER_IN"
normalizeType("WITHDRAWAL", "user")   → "TRANSFER_IN"
normalizeType("DEPOSIT", "user")      → "TRANSFER_OUT"
normalizeType("BUY", "exchange")      → "BUY"  // Unchanged
```

**Output Statistics**:
```typescript
{
  source: 'user',
  totalRows: 26,
  validRows: 23,
  inserted: 25,      // All rows (including invalid)
  duplicates: 1,      // USR-001 duplicate skipped
  errors: 0,          // No errors (we save everything)
  qualityIssues: [
    {
      row: 19,
      field: 'timestamp',
      issue: 'Invalid timestamp format: "2024-03-09T"'
    }
  ]
}
```

#### `normalizeAsset(asset)`

**Purpose**: Convert asset names to standardized format

**Mapping Table**:

| User Input | Normalized |
|-----------|------------|
| bitcoin, btc, xbt | BTC |
| ethereum, eth | ETH |
| tether, usdt | USDT |
| solana, sol | SOL |
| polygon, matic | MATIC |

**Why store both?**
```typescript
{
  asset: "bitcoin",        // Original user input (for display)
  normalizedAsset: "BTC"   // Standardized (for matching)
}
```

#### `normalizeType(type, source)`

**Purpose**: Handle opposite transaction perspectives

**Perspective Mapping**:
```typescript
// User sent money out = Exchange received money in
"TRANSFER_OUT" (user) → "TRANSFER_IN" (exchange perspective)

// User bought = Exchange sold to user
"BUY" (user) → "BUY" (exchange perspective - same)
```

**Real Example**:
```javascript
// Same transaction, opposite perspectives:
User:     { type: "TRANSFER_OUT", amount: 1.0 ETH }
Exchange: { type: "TRANSFER_IN",  amount: 1.0 ETH }

// After normalization:
User.normalizedType:     "TRANSFER_IN"
Exchange.normalizedType: "TRANSFER_IN"
// They match! ✅
```

---

## 3. Matching Service (`matching.service.ts`)

### Purpose
Implements the core matching algorithm to pair user and exchange transactions.

### Core Responsibilities
- Calculate match scores between transaction pairs
- Find best match using greedy algorithm
- Detect conflicts (matches outside tolerances)
- Prevent double-matching

### Key Functions

#### `calculateMatchScore(userTx, exchangeTx, config)`

**Purpose**: Calculate how well two transactions match (0-1 scale)

**Scoring Formula**:

```typescript
Score = TimestampScore + QuantityScore + TypeScore

// Timestamp Score (max 0.4)
if (timestampDiff <= tolerance) {
  timestampScore = 0.4 * (1 - timestampDiff / tolerance)
} else {
  timestampScore = 0.1 * (1 - timestampDiff / (tolerance * 10))
}

// Quantity Score (max 0.4)
if (quantityDiff <= tolerancePct) {
  quantityScore = 0.4 * (1 - quantityDiff / tolerancePct)
} else {
  quantityScore = 0.1 * (1 - quantityDiff / (tolerancePct * 10))
}

// Type Score (0.2 if types match)
typeScore = 0.2

// Total: 0.0 to 1.0
```

**Example Calculation**:
```javascript
// Perfect match
User:   BTC 0.5 @ 09:00:00
Exchange: BTC 0.5 @ 09:00:32
Config: tolerance=300s, 0.01%

timestampScore = 0.4 × (1 - 32/300) = 0.357
quantityScore = 0.4 × (1 - 0/0.01) = 0.4
typeScore = 0.2
Total Score = 0.957 (95.7% match)

// Conflicting match (quantity difference)
User:   BTC 0.3 @ 13:30:00
Exchange: BTC 0.3001 @ 13:30:00
Config: tolerance=300s, 0.01%

timestampScore = 0.4 × (1 - 0/300) = 0.4
quantityDiff = 0.033% > 0.01%
quantityScore = 0.1 × (1 - 0.033/0.1) = 0.067
typeScore = 0.2
Total Score = 0.667 (66.7% match - still matched but conflicting)
```

#### `findBestMatch(userTx, exchangeTransactions, config)`

**Purpose**: Find the best matching exchange transaction for a user transaction

**Algorithm**:
```typescript
1. Initialize candidates = []
2. For each exchange transaction:
   - Calculate match score
   - If score > 0.5, add to candidates
3. Sort candidates by score (descending)
4. Return highest score candidate (or null if none)
```

**Why 0.5 threshold?**
- Scores < 0.5 indicate poor matches (likely wrong transaction)
- Prevents matching completely unrelated transactions
- Example: BTC 0.5 matched with ETH 0.5 would score ~0.2

#### `runMatching(runId, config)`

**Purpose**: Main matching orchestration

**Complete Flow**:
```typescript
1. Load all valid transactions (isValid = true, isMatched = false)
   - User: 22 transactions
   - Exchange: 25 transactions

2. Initialize tracking sets
   - matchedUserIds = new Set()
   - matchedExchangeIds = new Set()

3. For each user transaction:
   a. Skip if already matched
   b. Find best exchange match (score > 0.6)
   c. If found and exchange not matched:
      - Determine if conflicting
      - Store match result
      - Mark both as matched
      - Update database

4. Categorize results:
   - Perfect matches: within tolerances
   - Conflicting matches: outside tolerances
   - Unmatched user: no match found
   - Unmatched exchange: never matched
```

**Greedy Algorithm Justification**:

| Algorithm | Complexity | Optimal? | Use Case |
|-----------|-----------|----------|----------|
| Greedy | O(n × m) | No (but good) | Real-time, 1000+ txs |
| Hungarian | O(n³) | Yes | Small datasets (<100) |
| Brute Force | O(n! × m!) | Yes | Impossible for >10 txs |

#### `isConflictingMatch(match, config)`

**Purpose**: Determine if a match should be flagged as conflicting

**Rules**:
```typescript
if (timestampDiff > tolerance && quantityDiff > tolerancePct) {
  return { isConflicting: true, reason: "Both fields exceed tolerances" };
}
if (timestampDiff > tolerance) {
  return { isConflicting: true, reason: `Timestamp diff ${diff}s > ${tolerance}s` };
}
if (quantityDiff > tolerancePct) {
  return { isConflicting: true, reason: `Quantity diff ${diff}% > ${tolerancePct}%` };
}
return { isConflicting: false };
```

---

## 4. Reconciliation Service (`reconciliation.service.ts`)

### Purpose
Orchestrates the complete reconciliation process, managing runs and results.

### Core Responsibilities
- Start and track reconciliation runs
- Coordinate matching service execution
- Store results in database
- Provide status and summary APIs

### Key Functions

#### `startReconciliation(config)`

**Purpose**: Initiate a new reconciliation run

**Asynchronous Pattern**:
```typescript
1. Generate unique runId: rec_1700000000_abc123
2. Create run record with status: 'pending'
3. Save to database
4. Start background processing (does NOT await)
5. Return runId immediately
```

**Why async?** Matching could take minutes for large datasets. Don't block the API!

**Status Lifecycle**:
```
pending → running → completed/failed
```

**Run ID Format**:
```typescript
runId = `rec_${Date.now()}_${uuid().slice(0,8)}`
// Example: rec_1700000000000_abc12345
```

#### `processReconciliation(runId, config)`

**Purpose**: Execute the actual matching logic (background)

**Processing Steps**:
```typescript
1. Reset previous matches (if configured)
   - Update all transactions: isMatched = false, matchedWith = null

2. Get counts
   - Total user/exchange transactions
   - Valid transactions (isValid = true)

3. Run matching service
   - Passes config tolerances
   - Receives matches and unmatched IDs

4. Separate perfect vs conflicting matches

5. Update reconciliation run:
   - status = 'completed'
   - completedAt = now
   - summary = { matched, conflicting, unmatched... }
   - matches = [...] (detailed results)
   - unmatchedUserIds, unmatchedExchangeIds

6. Update all matched transactions:
   - transaction.isMatched = true
   - transaction.matchedWith = partnerId
```

**Result Storage**:
```typescript
{
  runId: "rec_1700000000_abc123",
  status: "completed",
  summary: {
    matched: 18,           // Perfect matches
    conflicting: 2,       // Matched but outside tolerances
    unmatchedUser: 3,     // Invalid or no match
    unmatchedExchange: 2  // No matching user
  },
  matches: [
    {
      userTransactionId: ObjectId("..."),
      exchangeTransactionId: ObjectId("..."),
      isConflicting: false,
      matchScore: 0.95,
      timestampDiff: 32,
      quantityDiff: 0.001
    }
  ]
}
```

#### `getReconciliationRun(runId)`

**Purpose**: Retrieve a specific reconciliation run

**Usage**:
```typescript
// Controllers use this to fetch run data for reports
const run = await ReconciliationService.getReconciliationRun(runId);
```

---

## Service Interaction Examples

### Complete Reconciliation Flow
```typescript
// 1. Client POST /reconcile
POST /api/reconcile
{
  "timestampToleranceSeconds": 300,
  "quantityTolerancePct": 0.01
}

// 2. Controller calls ReconciliationService
const run = await ReconciliationService.startReconciliation(config);

// 3. ReconciliationService starts background process
await this.processReconciliation(runId, config);

// 4. In background, processReconciliation calls MatchingService
const { matches, unmatchedUserIds, unmatchedExchangeIds } = 
  await MatchingService.runMatching(runId, config);

// 5. MatchingService queries valid transactions
const userTransactions = await Transaction.find({ 
  source: 'user', isValid: true 
});

// 6. For each user, find best match
const bestMatch = await this.findBestMatch(userTx, exchangeTransactions, config);

// 7. Calculate scores using DataQualityService's normalized fields
if (userTx.normalizedAsset === exchangeTx.normalizedAsset) {
  // Calculate timestamp and quantity scores
}

// 8. Return results to ReconciliationService
// 9. ReconciliationService saves results to database
// 10. Client can now GET /report/:runId to see results
```

### Data Flow with Invalid Transactions
```typescript
// CSV contains bad row
Row 19: "2024-03-09T", ETH, -0.1

// 1. DataQualityService validates
validation.isValid = false  // Critical error
validation.issues = [
  { field: 'timestamp', severity: 'error' },
  { field: 'quantity', severity: 'error' }
]

// 2. IngestionService saves anyway
transaction = new Transaction({
  source: 'user',
  timestamp: null,
  quantity: 0,
  isValid: false,
  dataQualityIssues: [...]
})
await transaction.save()  // Saved with isValid: false

// 3. MatchingService ignores it
const userTransactions = await Transaction.find({ 
  source: 'user', 
  isValid: true  // Only queries valid transactions
})
// Invalid transaction never considered for matching

// 4. But it appears in report
GET /report/:runId/unmatched
{
  "unmatched": [{
    "category": "unmatched_user",
    "reason": "Invalid transaction - cannot be matched",
    "qualityIssues": ["timestamp: Invalid format (error)"]
  }]
}
```

---

## Error Handling Patterns

### Validation Errors (Non-Critical)
```typescript
// Warning - transaction still saved
severity: 'warning'
// Transaction saved with isValid: true
// Can still be matched
```

### Critical Errors
```typescript
// Error - transaction saved but cannot match
severity: 'error' + critical field (timestamp/quantity/type/asset)
// Transaction saved with isValid: false
// Never considered in matching
```

### Database Errors
```typescript
try {
  await transaction.save();
} catch (dbError) {
  // Log error, continue with next transaction
  logger.error('Failed to save transaction:', dbError);
  result.errors++;
}
```

---

## Performance Considerations

### Indexing Strategy
```typescript
// Compound index for matching queries
TransactionSchema.index({ 
  normalizedAsset: 1,   // Fast asset filtering
  normalizedType: 1,    // Fast type filtering
  timestamp: 1,         // Range queries
  quantity: 1           // Exact matching
}, {
  partialFilterExpression: { isValid: true }  // Only index valid txs
});
```

### Memory Management
```typescript
// Load all valid transactions once (not per user)
const exchangeTransactions = await Transaction.find({ 
  source: 'exchange', isValid: true 
});  // 25 transactions in memory

// Reuse for each user transaction (O(1) lookup)
for (const userTx of userTransactions) {  // 22 iterations
  const bestMatch = findBestMatch(userTx, exchangeTransactions);
}
```

### Early Rejection
```typescript
// Cheap checks first
if (userTx.normalizedAsset !== exchangeTx.normalizedAsset) return null;  // O(1)
if (userTx.normalizedType !== exchangeTx.normalizedType) return null;    // O(1)

// Expensive calculations only if cheap checks pass
const timestampDiff = calculateTimestampDiff();  // O(1) but more expensive
```
