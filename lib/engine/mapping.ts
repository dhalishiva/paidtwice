// Column auto-mapping and header-row detection for AP exports
// (QuickBooks, Xero, Sage, NetSuite, SAP, Dynamics, MYOB, bank exports...).

import { GROUP_HEADINGS, type ColumnMapping, type FieldKey } from "./types";
import { parseAmountCents, parseDateDays } from "./parse";

export function normalizeHeader(h: string): string {
  return String(h ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2") // InvoiceNumber -> Invoice Number
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // POAddress -> PO Address
    .toLowerCase()
    .replace(/#/g, " no ")
    .replace(/\bno\.?(?=\s|$)/g, "no")
    .replace(/[_\-./():\[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SYNONYMS: Record<FieldKey, string[]> = {
  vendorName: [
    "vendor name", "supplier name", "payee name", "creditor name", "beneficiary name", "vendor", "supplier", "payee",
    "creditor", "beneficiary", "contact name", "contactname", "contact", "account name", "merchant", "merchant name",
    "company name", "name 1", "name1", "pay to", "paid to", "party name", "name", "company", "party", "lieferant",
    "lieferantenname", "kreditor name", "kreditorname", "fournisseur", "proveedor", "fornitore", "leverancier",
  ],
  vendorId: [
    "vendor id", "vendor number", "vendor no", "vendor code", "vendor account", "vendor acct", "supplier id",
    "supplier number", "supplier no", "supplier code", "supplier account", "creditor id", "creditor number",
    "creditor no", "creditor account", "payee id", "vendor ref", "supplier ref", "account number", "account no",
    "acct no", "account code", "lifnr", "vendor internal id", "vendor key", "vendorid", "supplierid", "kreditor",
    "kreditorennummer",
  ],
  invoiceNumber: [
    "invoice number", "invoice no", "vendor invoice number", "vendor invoice no", "supplier invoice number",
    "supplier invoice no", "supplier invoice", "vendor invoice", "invoice num", "invoice ref", "invoice reference",
    "invoice id", "inv number", "inv no", "inv num", "bill number", "bill no", "bill ref", "bill id", "invoice",
    "inv", "invoicenumber", "invoiceno", "billnumber", "reference", "ref", "reference number", "reference no",
    "ref no", "ref number", "external document no", "external document number", "external reference", "xblnr",
    "document reference", "supplier reference", "vendor reference", "num", "number", "no", "rechnungsnummer",
    "belegnummer extern", "document number", "document no", "doc no",
  ],
  invoiceDate: [
    "invoice date", "inv date", "bill date", "document date", "doc date", "date of invoice", "invoice dt", "bldat",
    "issue date", "date issued", "invoicedate", "txn date", "transaction date", "date", "posting date", "post date",
    "entry date", "gl date", "budat", "rechnungsdatum", "belegdatum",
  ],
  paymentDate: [
    "payment date", "paid date", "date paid", "pay date", "check date", "cheque date", "clearing date", "clear date",
    "augdt", "value date", "payment run date", "settlement date", "paid on", "payment dt", "zahlungsdatum",
    "ausgleichsdatum",
  ],
  amount: [
    "amount paid", "paid amount", "payment amount", "invoice amount", "gross amount", "invoice total", "total amount",
    "amount", "gross", "total", "amount in document currency", "amount in doc curr", "amount in dc",
    "amount in local currency", "amount in lc", "amount doc curr", "amount lc", "amt", "value", "debit",
    "debit amount", "net amount", "original amount", "wrbtr", "dmbtr", "line amount", "amount due", "balance",
    "open amount", "betrag", "montant", "importe", "importo", "bedrag",
  ],
  creditAmount: ["credit", "credit amount", "credits", "cr", "haben", "credit lc", "credit dc", "credit amount lc", "credit amount dc"],
  invoiceTotal: ["invoice amount", "invoice total", "original amount", "bill amount", "bill total", "gross amount", "total amount"],
  currency: [
    "currency", "currency code", "document currency", "curr", "ccy", "cur", "waers", "iso currency", "currency key",
    "crcy", "waehrung", "währung", "devise", "moneda",
  ],
  docType: [
    "transaction type", "document type", "doc type", "txn type", "type", "entry type", "source", "blart",
    "trans type", "category", "belegart", "voucher type",
  ],
  status: ["status", "invoice status", "bill status", "payment status", "state", "approval status", "document status"],
  docId: [
    "document number", "document no", "doc number", "doc no", "document id", "transaction id", "txn id",
    "transaction number", "payment id", "payment number", "payment no", "payment reference", "check number",
    "check no", "cheque number", "cheque no", "belnr", "journal number", "journal no", "voucher number",
    "voucher no", "voucher", "entry number", "entry no", "record id", "internal id", "id",
  ],
  description: [
    "description", "memo", "narrative", "line description", "item description", "text", "details", "notes", "note",
    "particulars", "comment", "comments", "purpose", "sgtxt", "memo description", "buchungstext",
  ],
};

/** Field assignment order: the most important fields claim columns first. */
const PRIORITY: FieldKey[] = [
  "amount", "creditAmount", "invoiceNumber", "vendorName", "vendorId", "invoiceDate", "paymentDate", "currency", "docType",
  "status", "invoiceTotal", "docId", "description",
];

const ALL_SYNONYMS = new Set(Object.values(SYNONYMS).flat());

/** Generic words that only count when they are the whole header ("Number", not "Vendor Number"). */
const EXACT_ONLY = new Set([
  "num", "number", "no", "name", "date", "type", "total", "value", "id", "ref", "inv", "invoice", "status", "state",
  "company", "party", "contact", "source", "category", "text", "note", "notes", "details", "balance", "debit", "gross",
  "amt", "comment", "comments", "purpose", "voucher", "cur", "curr", "ccy", "vendor", "supplier", "payee",
]);

function headerScore(field: FieldKey, header: string): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  const list = SYNONYMS[field];
  const exact = list.indexOf(h);
  if (exact >= 0) return 100 - exact;
  let best = 0;
  list.forEach((syn, i) => {
    if (syn.length < 3 || EXACT_ONLY.has(syn)) return;
    const re = new RegExp(`(^|\\s)${syn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
    if (re.test(h)) best = Math.max(best, 60 - i * 0.5);
  });
  if (best && (field === "amount" || field === "invoiceTotal") && /\b(tax|vat|gst|hst|discount|unit|qty|quantity|fee|rate|percent|withholding)\b/.test(h)) {
    best *= 0.3;
  }
  if (best && field === "invoiceNumber" && /\b(date|amount|total|name)\b/.test(h)) best *= 0.3;
  if (best && field === "vendorName" && /\b(id|no|number|code|account|acct)\b/.test(h)) best *= 0.3;
  return best;
}

function sample(rows: string[][], col: number, n = 400): string[] {
  const out: string[] = [];
  const step = Math.max(1, Math.floor(rows.length / n));
  for (let i = 0; i < rows.length && out.length < n; i += step) {
    const v = rows[i]?.[col];
    if (v != null && String(v).trim() !== "") out.push(String(v).trim());
  }
  return out;
}

function rate(values: string[], ok: (v: string) => boolean): number {
  if (!values.length) return 0;
  let n = 0;
  for (const v of values) if (ok(v)) n++;
  return n / values.length;
}

const isAmount = (v: string) => parseAmountCents(v, ".") !== null || parseAmountCents(v, ",") !== null;
const isDate = (v: string) => parseDateDays(v, "DMY") !== null || parseDateDays(v, "MDY") !== null;
const isNumericOnly = (v: string) => /^[\s\d.,\-+()$£€]+$/.test(v);
const looksDateish = (v: string) => /\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}/.test(v) && isDate(v);

function contentFactor(field: FieldKey, values: string[]): number {
  if (!values.length) return 0.3;
  switch (field) {
    case "amount":
    case "creditAmount":
    case "invoiceTotal": {
      const r = rate(values, isAmount);
      // Dates often parse as numbers too ("15.03.2025"), so penalise date-like columns.
      const d = rate(values, looksDateish);
      return r >= 0.8 && d < 0.3 ? 1 : 0.05;
    }
    case "invoiceDate":
    case "paymentDate":
      return rate(values, isDate) >= 0.7 ? 1 : 0.05;
    case "vendorName":
      return rate(values, isNumericOnly) <= 0.5 ? 1 : 0.2;
    case "currency":
      return rate(values, (v) => v.length <= 20 && /^[A-Za-z$£€¥₹ .]{1,20}$/.test(v)) >= 0.8 ? 1 : 0.05;
    case "invoiceNumber":
      return rate(values, looksDateish) > 0.5 ? 0.05 : 1;
    default:
      return 1;
  }
}

/** Pick the most likely header row among the first rows of a sheet. */
export function detectHeaderRow(grid: string[][]): number {
  let bestIdx = 0;
  let bestScore = -1;
  const limit = Math.min(grid.length, 30);
  for (let i = 0; i < limit; i++) {
    const row = grid[i] || [];
    const cells = row.map((c) => String(c ?? "").trim()).filter(Boolean);
    if (cells.length < 2) continue;
    let syn = 0;
    let text = 0;
    for (const c of cells) {
      if (ALL_SYNONYMS.has(normalizeHeader(c))) syn++;
      if (!isNumericOnly(c) && !isDate(c)) text++;
    }
    const score = syn * 3 + text * 0.5 + (text === cells.length ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
    if (syn >= 3) break; // good enough, stop before data rows can compete
  }
  return bestIdx;
}

/**
 * Reports grouped by vendor (QuickBooks Transaction List by Vendor, Xero reports grouped
 * by contact) put the vendor on a heading row of its own, with one cell filled, and leave
 * the first column blank on the transaction rows below it.
 */
export function detectGroupHeadings(rows: string[][], amountCol: number | undefined): boolean {
  let headings = 0;
  let blankFirst = 0;
  let data = 0;
  const limit = Math.min(rows.length, 4000);
  for (let i = 0; i < limit; i++) {
    const r = rows[i] || [];
    const filled = r.reduce((n, c) => n + (String(c ?? "").trim() ? 1 : 0), 0);
    if (!filled) continue;
    const first = String(r[0] ?? "").trim();
    const amt = amountCol !== undefined ? String(r[amountCol] ?? "").trim() : "";
    if (filled === 1 && first && !isAmount(first) && !/^(grand\s+)?(sub)?totals?:?\s*$|^total\s+for\b/i.test(first)) headings++;
    else if (amt && isAmount(amt)) {
      data++;
      if (!first) blankFirst++;
    }
  }
  // QuickBooks leaves the first column blank on transaction rows; Xero puts the date there,
  // so also accept files with a steady rhythm of heading rows.
  return headings >= 2 && data >= 2 && (blankFirst / data >= 0.6 || headings >= data / 50);
}

export function autoMap(headers: string[], rows: string[][]): ColumnMapping {
  const cols = headers.map((_, i) => i);
  const values = cols.map((c) => sample(rows, c));
  const mapping: ColumnMapping = {};
  const used = new Set<number>();

  for (const field of PRIORITY) {
    let best = -1;
    let bestScore = 0;
    for (const c of cols) {
      if (used.has(c)) continue;
      const s = headerScore(field, headers[c]) * contentFactor(field, values[c]);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best >= 0 && bestScore >= 20) {
      mapping[field] = best;
      used.add(best);
    }
  }

  // Fallback: an amount column is required. Pick the most numeric, decimal-looking column.
  if (mapping.amount === undefined) {
    let best = -1;
    let bestRate = 0;
    for (const c of cols) {
      if (used.has(c)) continue;
      const v = values[c];
      const r = rate(v, isAmount);
      const decimals = rate(v, (x) => /[.,]\d{2}\b/.test(x) && !looksDateish(x));
      const dates = rate(v, looksDateish);
      if (r >= 0.9 && decimals >= 0.3 && dates < 0.3 && r > bestRate) {
        bestRate = r;
        best = c;
      }
    }
    if (best >= 0) {
      mapping.amount = best;
      used.add(best);
    }
  }

  // A credit column only matters when the amount column is the matching debit column.
  if (mapping.creditAmount !== undefined) {
    const amountHeader = mapping.amount !== undefined ? normalizeHeader(headers[mapping.amount]) : "";
    if (!/\b(debit|debits|dr|soll)\b/.test(amountHeader)) delete mapping.creditAmount;
  }

  // An "invoice total" only matters next to an amount-paid column.
  if (mapping.invoiceTotal !== undefined) {
    const amountHeader = mapping.amount !== undefined ? normalizeHeader(headers[mapping.amount]) : "";
    if (!/\bpaid\b|\bpayment\b/.test(amountHeader)) delete mapping.invoiceTotal;
  }

  // Vendor taken from group headings when no vendor column exists.
  if (mapping.vendorName === undefined && detectGroupHeadings(rows, mapping.amount)) {
    mapping.vendorName = GROUP_HEADINGS;
  }
  return mapping;
}

export function mappingProblems(mapping: ColumnMapping): string[] {
  const problems: string[] = [];
  if (mapping.amount === undefined) problems.push("Choose the column that holds the invoice or payment amount.");
  if (mapping.vendorName === undefined && mapping.vendorId === undefined)
    problems.push("Choose a vendor name or vendor ID column.");
  return problems;
}

export function mappingHints(mapping: ColumnMapping): string[] {
  const hints: string[] = [];
  if (mapping.invoiceNumber === undefined)
    hints.push("No invoice number column: the invoice-number checks will be skipped.");
  if (mapping.invoiceDate === undefined && mapping.paymentDate === undefined)
    hints.push("No date column: the same-day and close-dates checks will be skipped.");
  return hints;
}

/** Header names that only appear in exports with one row per invoice line. */
export function looksLineLevel(headers: string[]): boolean {
  return headers.some((h) =>
    /\b(line amount|unit amount|unit price|unit cost|quantity|qty|line description|item code|inventory item|line no|line number|item description)\b/.test(
      normalizeHeader(h),
    ),
  );
}
