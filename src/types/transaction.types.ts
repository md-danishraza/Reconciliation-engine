// raw data
export interface TransactionData {
  transaction_id?: string;
  timestamp: string;
  type: string;
  asset: string;
  quantity: number;
  price_usd?: number;
  fee?: number;
  note?: string;
}

// processed clean data
export interface ParsedTransaction {
  source: "user" | "exchange";
  originalRow: TransactionData;
  transactionId?: string;
  timestamp: Date;
  asset: string;
  quantity: number;
  type: string;
  priceUsd?: number;
  fee?: number;
  note?: string;
  dataQualityIssues: string[];
}

// problem logging
export interface DataQualityIssue {
  row: number;
  field: string;
  issue: string;
  severity: "error" | "warning";
}
