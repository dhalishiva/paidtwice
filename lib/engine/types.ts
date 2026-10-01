// Core types for the PaidTwice duplicate-payment engine.
// The engine is pure TypeScript with no DOM access, so it runs in a Web Worker,
// in Node (tests) and anywhere else.

export type FieldKey =
  | "vendorName"
  | "vendorId"
  | "invoiceNumber"
  | "invoiceDate"
  | "paymentDate"
  | "amount"
  | "creditAmount"
  | "invoiceTotal"
  | "currency"
  | "docType"
  | "status"
  | "docId"
  | "description";

export const FIELD_KEYS: FieldKey[] = [
  "vendorName",
  "vendorId",
  "invoiceNumber",
  "invoiceDate",
  "paymentDate",
  "amount",
  "creditAmount",
  "invoiceTotal",
  "currency",
  "docType",
  "status",
  "docId",
  "description",
];

export const FIELD_LABELS: Record<FieldKey, string> = {
  vendorName: "Vendor name",
  vendorId: "Vendor ID",
  invoiceNumber: "Invoice number",
  invoiceDate: "Invoice date",
  paymentDate: "Payment date",
  amount: "Amount",
  creditAmount: "Credit amount",
  invoiceTotal: "Invoice total",
  currency: "Currency",
  docType: "Transaction type",
  status: "Status",
  docId: "Document or payment number",
  description: "Description",
};

/**
 * Column index per field. Missing key = not mapped.
 * vendorName may be GROUP_HEADINGS: the vendor is taken from section headings
 * in the file (QuickBooks "Transaction List by Vendor", Xero reports grouped by contact).
 */
export type ColumnMapping = Partial<Record<FieldKey, number>>;
export const GROUP_HEADINGS = -1;

export type DateOrder = "auto" | "DMY" | "MDY" | "YMD";
export type DecimalSeparator = "auto" | "." | ",";
export type LineItemMode = "auto" | "combine" | "separate";

export interface RawTable {
  headers: string[];
  rows: string[][];
  /** 1-based line number of the header row in the source file. */
  headerLine: number;
  sheetName?: string;
}

export interface ScanSettings {
  /** Days between dates for the "same vendor & amount, close dates" test. */
  nearDateWindowDays: number;
  /** Ignore rows whose absolute amount is below this (major units). */
  minAmount: number;
  dateOrder: DateOrder;
  decimalSeparator: DecimalSeparator;
  /** Display currency used when the file has no currency column. */
  defaultCurrency: string;
  /** Combine rows that are lines of the same bill (Xero bills export and similar). */
  lineItems: LineItemMode;
  /** Enable or disable individual tests. */
  tests: Record<TestCode, boolean>;
}

export type TestCode =
  | "EXACT"
  | "INV_FORMAT"
  | "INV_TYPO"
  | "CROSS_VENDOR"
  | "AMOUNT_VARIANT"
  | "SAME_DAY"
  | "NEAR_DATE"
  | "SIMILAR_VENDOR";

export interface TestInfo {
  code: TestCode;
  name: string;
  short: string;
  description: string;
}

export const TESTS: TestInfo[] = [
  {
    code: "EXACT",
    name: "Exact duplicate",
    short: "Exact",
    description:
      "Same vendor, same invoice number, same amount. The classic duplicate that slips through when a bill is entered twice or an approval is re-submitted.",
  },
  {
    code: "INV_FORMAT",
    name: "Invoice number formatted differently",
    short: "Format",
    description:
      "Same vendor and amount, and the invoice numbers match once prefixes, punctuation, leading zeros and OCR look-alikes are ignored (INV-00123 = 123, 1O23 = 1023).",
  },
  {
    code: "INV_TYPO",
    name: "Invoice number keying error",
    short: "Typo",
    description:
      "Same vendor, amount and invoice date, and the invoice numbers differ by one transposed or mistyped character (48213 vs 48231). The vendor's own numbering pace is taken into account.",
  },
  {
    code: "CROSS_VENDOR",
    name: "Same invoice under two vendor records",
    short: "Two vendors",
    description:
      "The same invoice number and amount booked against two different vendor records, usually a duplicate vendor in the master file.",
  },
  {
    code: "AMOUNT_VARIANT",
    name: "Same invoice, amount keyed differently",
    short: "Amount",
    description:
      "Same vendor and invoice number, but the amounts differ by a transposition, a shifted decimal point or a sales-tax/VAT rate (gross paid once, net paid again).",
  },
  {
    code: "SAME_DAY",
    name: "Same vendor, amount and date",
    short: "Same day",
    description: "Same vendor, same amount and same date, where at least one entry has no invoice number.",
  },
  {
    code: "NEAR_DATE",
    name: "Same vendor and amount, close dates",
    short: "Close dates",
    description:
      "Same vendor and amount within a few days, where an invoice number is missing, or a bill that was also paid by a separate check or expense. Regular weekly or monthly charges are filtered out.",
  },
  {
    code: "SIMILAR_VENDOR",
    name: "Look-alike vendor, same amount and date",
    short: "Look-alike",
    description: "Two vendor records with near-identical names paid the same amount on the same date.",
  },
];

export const TEST_BY_CODE: Record<TestCode, TestInfo> = Object.fromEntries(TESTS.map((t) => [t.code, t])) as Record<
  TestCode,
  TestInfo
>;

export const DEFAULT_SETTINGS: ScanSettings = {
  nearDateWindowDays: 14,
  minAmount: 1,
  dateOrder: "auto",
  decimalSeparator: "auto",
  defaultCurrency: "USD",
  lineItems: "auto",
  tests: {
    EXACT: true,
    INV_FORMAT: true,
    INV_TYPO: true,
    CROSS_VENDOR: true,
    AMOUNT_VARIANT: true,
    SAME_DAY: true,
    NEAR_DATE: true,
    SIMILAR_VENDOR: true,
  },
};

/** What a row is, judged from its transaction type and sign. */
export type RowKind = "invoice" | "expense" | "payment" | "credit" | "other" | "unknown";

export interface NormalizedRow {
  /** 0-based index into the data rows. */
  idx: number;
  /** 1-based line in the source file, for the user to find it. */
  line: number;
  kind: RowKind;
  vendorName: string;
  vendorId: string;
  vendorKey: string;
  vendorNameNorm: string;
  invoiceNumber: string;
  invStrict: string;
  invLoose: string;
  invDigits: string;
  invPrefix: string;
  /** Too short or generic to count as evidence on its own. */
  invWeak: boolean;
  /** Days since 1970-01-01 (UTC) or null. */
  invoiceDate: number | null;
  paymentDate: number | null;
  /** Amount in minor units (cents). Positive for documents; credits are stored as positive too. */
  amountCents: number;
  /** Invoice total when the amount column is the amount paid (null when unknown). */
  invoiceTotalCents: number | null;
  currency: string;
  isCredit: boolean;
  docType: string;
  docId: string;
  description: string;
  /** Memo mentions a deposit, instalment, retention and similar part payments. */
  partialHint: boolean;
}

export type Confidence = "high" | "medium" | "low";

export interface FindingRow {
  line: number;
  vendorName: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  paymentDate: string | null;
  amountCents: number;
  docId: string;
  description: string;
  docType?: string;
}

export interface Finding {
  /** Stable id derived from the member rows' content and the test. */
  id: string;
  test: TestCode;
  /** Other tests that also linked rows in this group. */
  alsoMatched: TestCode[];
  score: number;
  confidence: Confidence;
  currency: string;
  /** Representative amount (largest member). */
  amountCents: number;
  /** Potential overpayment after credit-note offsets. */
  exposureCents: number;
  vendor: string;
  reasons: string[];
  rows: FindingRow[];
  /** Credit notes that appear to reverse the duplicate. */
  offsets: FindingRow[];
  reversed: boolean;
}

export interface CurrencyTotal {
  currency: string;
  scannedCents: number;
  /** High and medium confidence findings. */
  exposureCents: number;
  highExposureCents: number;
  /** Low-confidence findings, reported separately so noise never inflates the headline. */
  lowExposureCents: number;
}

export interface ScanStats {
  rowsTotal: number;
  rowsUsed: number;
  rowsSkipped: number;
  skippedReasons: Record<string, number>;
  credits: number;
  vendors: number;
  dateMin: string | null;
  dateMax: string | null;
  currencies: CurrencyTotal[];
  primaryCurrency: string;
  findings: number;
  reversedFindings: number;
  byTest: Record<TestCode, { count: number; exposureCents: number }>;
  byConfidence: Record<Confidence, { count: number; exposureCents: number }>;
  durationMs: number;
}

export interface ScanResult {
  findings: Finding[];
  stats: ScanStats;
  warnings: string[];
  settings: ScanSettings;
  mapping: ColumnMapping;
  detected: {
    dateOrder: Exclude<DateOrder, "auto">;
    decimalSeparator: "." | ",";
    currency: string;
    lineItems: boolean;
  };
}
