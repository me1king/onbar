export interface FinancialLedgerEntry {
  id: number;
  order_id: number | null;
  entry_type: string;
  amount: number;
  description: string | null;
  is_reconciled: boolean;
  created_at: string;
}

export interface InventoryFinanceRow {
  stock: number | null;
  cost_price: number | null;
  price: number | null;
}

export interface TaxLedgerEntry {
  amount: number;
  account_id: string | null;
}

export interface ReconciliationRow {
  is_matched: boolean;
  amount: number;
}

export interface AdminFinanceData {
  ledger: FinancialLedgerEntry[];
  inventory: InventoryFinanceRow[];
  taxEntries: TaxLedgerEntry[];
  reconciliation: ReconciliationRow[];
  errors: {
    ledger: string | null;
    inventory: string | null;
    tax: string | null;
    reconciliation: string | null;
  };
}
