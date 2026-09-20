export type CanonicalField =
  | "transaction_id" | "occurred_at" | "store" | "product"
  | "quantity" | "net_amount" | "customer_phone";

export interface CanonicalLineItem {
  transactionId: string;
  occurredAt: string;
  store: string;
  product: string;
  quantity: number;
  netAmount: number;
  customerKey?: string;
}

export interface DataHealth {
  rows: number;
  invalidRows: number;
  duplicateRows: number;
  customerOrderCoverage: number;
}

export interface CoreMetrics {
  netSales: number;
  orders: number;
  aov: number;
  identifiedOrders: number;
  identifiedCustomerCoverage: number;
  identifiedCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
}

export interface Insight {
  type: "STORE_DAYPART_SALES_DECLINE";
  severity: "medium" | "high";
  store: string;
  daypart: string;
  currentSales: number;
  baselineSales: number;
  salesDeltaPct: number;
  currentOrders: number;
  baselineOrders: number;
  orderDeltaPct: number;
  evidenceDates: string[];
}

export interface AnalysisResult {
  mapping: Partial<Record<CanonicalField, number>>;
  health: DataHealth;
  metrics: CoreMetrics;
  capabilities: {
    salesAnalytics: boolean;
    customerRetention: boolean;
    marginAnalytics: boolean;
  };
  insights: Insight[];
  items: CanonicalLineItem[];
}

export interface WorkbookSheetInspection {
  name: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  mapping: Partial<Record<CanonicalField, number>>;
  mappedRequired: number;
  mappedOptional: number;
  candidateScore: number;
}

export interface WorkbookInspection {
  sheets: WorkbookSheetInspection[];
  suggestedSheet?: string;
  ambiguous: boolean;
}

export interface WorkbookAnalysisResult extends AnalysisResult {
  workbook: WorkbookInspection & {
    selectedSheet: string;
    selectionSource: "explicit" | "suggested";
  };
}
