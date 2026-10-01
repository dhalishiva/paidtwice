// The duplicate-payment detection engine.
//
// Pipeline: raw table -> classified, normalised documents -> candidate pairs per check
// -> groups -> findings.
//
// Design rules, each learned from a false positive or a miss:
// - Signs are judged per transaction type, so SAP reversals and QuickBooks bill payments
//   are never mistaken for invoices.
// - A "reference" that repeats every month (RENT, a policy number) is not an invoice number.
// - Two invoice numbers one keystroke apart are only a typo when the invoices carry the same
//   (or nearly the same) invoice date and the gap is not explained by the vendor's own pace
//   of numbering.
// - Rows can belong to one finding only, and exposure is "everything paid minus the one
//   legitimate payment", so overlapping checks never double count.
// - Weak signals stay low confidence and never inflate the headline figure.

import {
  type ColumnMapping,
  type Confidence,
  type FieldKey,
  type Finding,
  type FindingRow,
  GROUP_HEADINGS,
  type NormalizedRow,
  type RawTable,
  type RowKind,
  type ScanResult,
  type ScanSettings,
  type ScanStats,
  type TestCode,
  TESTS,
} from "./types";
import {
  currencyFromAmount,
  daysToIso,
  detectDateOrder,
  detectDecimalSeparator,
  normalizeCurrency,
  parseAmountCents,
  parseDateDays,
} from "./parse";
import {
  amountRelation,
  deletionVariants,
  invoiceKeys,
  normalizeVendor,
  numericTail,
  oneEdit,
  PARTIAL_HINT,
  vendorSimilarity,
} from "./normalize";
import { looksLineLevel, normalizeHeader } from "./mapping";

// ---------------------------------------------------------------------------
// Helpers

function groupBy<T>(items: Iterable<T>, key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

class UnionFind {
  parent: Int32Array;
  constructor(n: number) {
    this.parent = new Int32Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  find(x: number): number {
    const p = this.parent;
    while (p[x] !== x) {
      p[x] = p[p[x]];
      x = p[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

/** cyrb53: a fast 53-bit string hash, plenty for stable finding ids. */
function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const formatters = new Map<string, Intl.NumberFormat | null>();

export function formatMoney(cents: number, currency: string): string {
  const value = cents / 100;
  let f = formatters.get(currency);
  if (f === undefined) {
    try {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
    } catch {
      f = null;
    }
    formatters.set(currency, f);
  }
  return f ? f.format(value) : `${currency} ${value.toFixed(2)}`;
}

function confidenceOf(score: number): Confidence {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

const CONF_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Row classification

type Kind = RowKind | "void" | "nonposting";

/** Read a transaction-type cell (QuickBooks, Xero, NetSuite, Sage, SAP document types). */
export function classify(docType: string): Kind {
  const t = docType.toLowerCase().replace(/credit\s*card/g, "card").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "unknown";
  if (/\b(void(ed)?|cancel(l?ed)?|deleted|rejected)\b/.test(t)) return "void";
  if (/\b(purchase order|estimate|quote|quotation|requisition|sales order|delayed (charge|credit))\b/.test(t) || /^(po|p\.o\.?)$/.test(t)) {
    return "nonposting";
  }
  if (
    /\b(bill payment|bill pmt|payable payment|vendor payment|supplier payment|payment|pmt|remittance|overpayment|prepayment|ach|wire|eft|bacs|sepa)\b/.test(t) ||
    /^(kz|zp|pp|pa)$/.test(t)
  ) {
    return "payment";
  }
  if (
    /\b(credit|cr memo|credit note|credit memo|refund|reversal|reversed|storno|vendor credit|bill credit|debit memo|deposit|receive money)\b/.test(t) ||
    /^(cn|kg|pc|dg|cm)$/.test(t)
  ) {
    return "credit";
  }
  if (/\b(check|cheque|expense|card|spend money|cash|direct payment|bank payment|expense report)\b/.test(t) || /^(bp|chk|exp)$/.test(t)) {
    return "expense";
  }
  if (
    /\b(bill|invoice|inv|purchase invoice|payable invoice|ap invoice|vendor bill|supplier invoice)\b/.test(t) ||
    /^(kr|re|rn|pi|ka|vi|ki)$/.test(t)
  ) {
    return "invoice";
  }
  if (/\b(journal|jnl|je|adjustment|transfer)\b/.test(t) || /^(ab|sa|jd|jc|ja)$/.test(t)) return "other";
  return "unknown";
}

const VOID_STATUS = /\b(void(ed)?|deleted|cancel(l?ed)?|rejected|reversed)\b/i;
/** A totals line ("Total", "Subtotal", "Total for Acme"), as opposed to a vendor such as "Total Quality Logistics". */
const TOTAL_LABEL = /^(grand\s+)?(sub)?totals?\b|^total\s+for\b/i;
const TOTAL_HEADING = /^(grand\s+)?(sub)?totals?:?\s*$|^total\s+for\b/i;

// ---------------------------------------------------------------------------
// Normalisation

export interface NormalizeOutput {
  /** Candidate documents (invoices, bills, standalone checks and expenses). */
  rows: NormalizedRow[];
  /** Credits, refunds and reversals (amountCents negative). */
  credits: NormalizedRow[];
  /** Payment lines set aside because the file also holds the bills they pay. */
  payments: NormalizedRow[];
  skipped: Record<string, number>;
  creditsTrusted: boolean;
  detected: ScanResult["detected"];
  warnings: string[];
  totalRows: number;
}

function sampleColumn(rows: string[][], col: number, max: number): string[] {
  if (col < 0) return [];
  const out: string[] = [];
  const step = Math.max(1, Math.floor(rows.length / max));
  for (let i = 0; i < rows.length; i += step) {
    const v = rows[i]?.[col];
    if (v != null && String(v).trim() !== "") out.push(String(v).trim());
  }
  return out;
}

interface Pre {
  row: NormalizedRow;
  kind: Kind;
  /** Signed amount as it appears in the file. */
  cents: number;
  sig: string;
}

export function normalizeTable(table: RawTable, mapping: ColumnMapping, settings: ScanSettings): NormalizeOutput {
  const warnings: string[] = [];
  const skipped: Record<string, number> = {};
  const skip = (reason: string, n = 1) => (skipped[reason] = (skipped[reason] || 0) + n);
  const col = (f: FieldKey) => {
    const c = mapping[f];
    return c === undefined || c < 0 ? -1 : c;
  };
  const cVendor = col("vendorName");
  const cVendorId = col("vendorId");
  const cInv = col("invoiceNumber");
  const cInvDate = col("invoiceDate");
  const cPayDate = col("paymentDate");
  const cAmount = col("amount");
  const cCredit = col("creditAmount");
  const cTotal = col("invoiceTotal");
  const cCurrency = col("currency");
  const cType = col("docType");
  const cStatus = col("status");
  const cDocId = col("docId");
  const cDesc = col("description");
  const groupVendor = mapping.vendorName === GROUP_HEADINGS;
  const cell = (row: string[], c: number): string => (c < 0 ? "" : String(row[c] ?? "").trim());

  // ---- Formats, judged over the whole column
  const amountValues = [...sampleColumn(table.rows, cAmount, 20_000), ...sampleColumn(table.rows, cCredit, 5_000)];
  const decimal: "." | "," =
    settings.decimalSeparator === "auto" ? detectDecimalSeparator(amountValues) : settings.decimalSeparator;

  let detectedCurrency = normalizeCurrency(settings.defaultCurrency) ?? "USD";
  if (cCurrency < 0) {
    const counts = new Map<string, number>();
    for (const v of amountValues) {
      const c = currencyFromAmount(v);
      if (c) counts.set(c, (counts.get(c) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= amountValues.length * 0.3) detectedCurrency = top[0];
  }

  const dateValues = new Set<string>();
  for (const r of table.rows) {
    if (dateValues.size >= 60_000) break;
    const a = cell(r, cInvDate);
    const b = cell(r, cPayDate);
    if (a) dateValues.add(a);
    if (b) dateValues.add(b);
  }
  const fallbackOrder = detectedCurrency === "USD" ? "MDY" : "DMY";
  const guess =
    settings.dateOrder === "auto" ? detectDateOrder(dateValues, fallbackOrder) : { order: settings.dateOrder, ambiguous: false };
  const dateOrder = guess.order;
  if (guess.ambiguous) {
    warnings.push(
      `Every date in this file could be read either day-first or month-first, so they were read ${
        dateOrder === "MDY" ? "month-first (03/04/2025 is March 4)" : "day-first (03/04/2025 is 3 April)"
      }. If that is wrong, change the date format under Scan settings and scan again.`,
    );
  }

  const vendorNormCache = new Map<string, string>();
  const normVendor = (v: string) => {
    let nv = vendorNormCache.get(v);
    if (nv === undefined) {
      nv = normalizeVendor(v);
      vendorNormCache.set(v, nv);
    }
    return nv;
  };
  const dateCache = new Map<string, number | null>();
  const parseDate = (v: string) => {
    if (!v) return null;
    let d = dateCache.get(v);
    if (d === undefined) {
      d = parseDateDays(v, dateOrder);
      dateCache.set(v, d);
    }
    return d;
  };
  const unknownCurrencies = new Set<string>();
  let badDates = 0;

  // ---- First pass: parse and classify every row
  const pre: Pre[] = [];
  let heading = "";
  table.rows.forEach((raw, idx) => {
    const line = table.headerLine + 1 + idx;
    let filled = 0;
    let firstFilled = "";
    for (const c of raw || []) {
      const v = String(c ?? "").trim();
      if (v) {
        filled++;
        if (!firstFilled) firstFilled = v;
      }
    }
    if (!filled) {
      skip("blank line");
      return;
    }
    const amountRaw = cell(raw, cAmount);
    const creditRaw = cell(raw, cCredit);
    // Section headings (vendor or contact names in grouped reports): one cell, no amount.
    if (filled === 1 && !amountRaw && !creditRaw) {
      if (!TOTAL_HEADING.test(firstFilled)) heading = firstFilled;
      skip("heading or title line");
      return;
    }
    const first = String(raw[0] ?? "").trim();
    let vendorName = groupVendor ? "" : cell(raw, cVendor);
    const vendorId = cell(raw, cVendorId);
    const inv = cell(raw, cInv);
    const invDateRaw = cell(raw, cInvDate);
    const payDateRaw = cell(raw, cPayDate);
    const label = vendorName || first;
    if (TOTAL_LABEL.test(label) && !inv && !invDateRaw && !payDateRaw) {
      skip("totals line");
      return;
    }
    let cents: number | null;
    if (cCredit >= 0) {
      // Split debit and credit columns: amount = debit - credit.
      const d = amountRaw ? parseAmountCents(amountRaw, decimal) : null;
      const c = creditRaw ? parseAmountCents(creditRaw, decimal) : null;
      cents = d === null && c === null ? null : (d ?? 0) - (c ?? 0);
    } else cents = parseAmountCents(amountRaw, decimal);
    if (cents === null) {
      skip(amountRaw || creditRaw ? "amount is not a number" : "no amount");
      return;
    }
    if (!vendorName && heading && (groupVendor || cVendor >= 0)) vendorName = heading;
    if (!vendorName && !vendorId) {
      skip("no vendor");
      return;
    }
    const status = cell(raw, cStatus);
    if (status && VOID_STATUS.test(status)) {
      skip("void, deleted or cancelled");
      return;
    }
    const docType = cell(raw, cType);
    const kind = classify(docType);
    if (kind === "void") {
      skip("void, deleted or cancelled");
      return;
    }
    if (kind === "nonposting") {
      skip("purchase order or other non-posting line");
      return;
    }
    if (cents === 0) {
      skip("zero amount");
      return;
    }
    const keys = invoiceKeys(inv);
    const vendorNameNorm = normVendor(vendorName || vendorId);
    const vendorKey = vendorId ? `ID:${vendorId.toUpperCase().replace(/^0+(?=.)/, "")}` : `NM:${vendorNameNorm}`;
    let currency = detectedCurrency;
    const curRaw = cell(raw, cCurrency);
    if (curRaw) {
      const c = normalizeCurrency(curRaw);
      if (c) currency = c;
      else {
        currency = curRaw.toUpperCase().slice(0, 12);
        unknownCurrencies.add(curRaw.slice(0, 20));
      }
    } else if (/[^\d\s.,'()+\-]/.test(amountRaw)) {
      currency = currencyFromAmount(amountRaw) ?? detectedCurrency;
    }
    const invoiceDate = parseDate(invDateRaw);
    const paymentDate = parseDate(payDateRaw);
    if ((invDateRaw && invoiceDate === null) || (payDateRaw && paymentDate === null)) badDates++;
    const totalRaw = cell(raw, cTotal);
    const totalCents = totalRaw ? parseAmountCents(totalRaw, decimal) : null;
    const description = cell(raw, cDesc);
    const row: NormalizedRow = {
      idx,
      line,
      kind: kind as RowKind,
      vendorName: vendorName || vendorId,
      vendorId,
      vendorKey,
      vendorNameNorm,
      invoiceNumber: inv,
      invStrict: keys.strict,
      invLoose: keys.loose,
      invDigits: keys.digits,
      invPrefix: keys.prefix,
      invWeak: keys.weak,
      invoiceDate,
      paymentDate,
      amountCents: cents,
      invoiceTotalCents: totalCents === null ? null : Math.abs(totalCents),
      currency,
      isCredit: false,
      docType,
      docId: cell(raw, cDocId),
      description,
      partialHint: Boolean(description && PARTIAL_HINT.test(description)),
    };
    pre.push({ row, kind, cents, sig: (raw || []).join("\u0001") });
  });

  if (unknownCurrencies.size) {
    warnings.push(
      `Some currency values were not recognised (${[...unknownCurrencies].slice(0, 4).join(", ")}). Rows are only compared with rows showing the same value.`,
    );
  }
  if (badDates > 0) {
    warnings.push(`${plural(badDates, "line has a date", "lines have dates")} that could not be read; those dates were left out.`);
  }

  // ---- Lines of the same bill (Xero bills export and similar) become one document
  const lineMode =
    settings.lineItems === "combine" ? true : settings.lineItems === "separate" ? false : cInv >= 0 && looksLineLevel(table.headers);
  let docsPre = pre;
  if (lineMode && cInv >= 0) {
    const amountHeader = cAmount >= 0 ? normalizeHeader(table.headers[cAmount] ?? "") : "";
    const lineAmounts = /\b(line|unit|item)\b/.test(amountHeader);
    const totalAmounts = !lineAmounts && /\b(total|gross|invoice amount|bill amount|amount due|balance)\b/.test(amountHeader);
    const merged: Pre[] = [];
    let run: Pre[] = [];
    let runKey = "";
    let sigs = new Set<string>();
    let combinedLines = 0;
    const flush = () => {
      if (run.length === 1) merged.push(run[0]);
      else if (run.length > 1) {
        const allSame = run.every((q) => q.cents === run[0].cents);
        const sum = run.reduce((a, q) => a + q.cents, 0);
        const cents = totalAmounts ? run[0].cents : lineAmounts ? sum : allSame ? run[0].cents : sum;
        const head = run[0];
        const description = run.find((q) => q.row.description)?.row.description ?? "";
        merged.push({ ...head, cents, row: { ...head.row, amountCents: cents, description } });
        combinedLines += run.length - 1;
      }
      run = [];
      runKey = "";
      sigs = new Set();
    };
    for (const p of pre) {
      const r = p.row;
      const key = r.invStrict ? `${r.vendorKey}|${r.currency}|${r.invStrict}|${r.invoiceDate ?? ""}|${r.docId}|${p.kind}` : "";
      // A line that repeats inside the run starts the next copy of the bill.
      if (key && key === runKey && !sigs.has(p.sig)) {
        run.push(p);
        sigs.add(p.sig);
        continue;
      }
      flush();
      if (key) {
        run = [p];
        runKey = key;
        sigs.add(p.sig);
      } else merged.push(p);
    }
    flush();
    docsPre = merged;
    if (combinedLines > 0) {
      warnings.push(
        `This file lists invoice lines, so ${plural(combinedLines, "extra line was", "extra lines were")} folded into their bills before checking.`,
      );
      skip("invoice line folded into its bill", combinedLines);
    }
  }

  // ---- Signs: judged per transaction type
  const signs = new Map<Kind, { pos: number; neg: number }>();
  for (const p of docsPre) {
    const s = signs.get(p.kind) || { pos: 0, neg: 0 };
    if (p.cents > 0) s.pos++;
    else s.neg++;
    signs.set(p.kind, s);
  }
  const spendSign = (k: Kind): 1 | -1 => {
    const s = signs.get(k);
    return s && s.neg > s.pos ? -1 : 1;
  };
  const hasTypes = cType >= 0 && docsPre.some((p) => p.kind !== "unknown");
  const hasInvoiceKind = docsPre.some((p) => p.kind === "invoice");
  const anchorKind: Kind = hasInvoiceKind ? "invoice" : docsPre.some((p) => p.kind === "expense") ? "expense" : "unknown";

  let creditsTrusted = true;
  const unknownSigns = signs.get("unknown");
  if (unknownSigns && !hasTypes) {
    const total = unknownSigns.pos + unknownSigns.neg;
    if (spendSign("unknown") === -1) {
      warnings.push(
        "Most amounts in this file are negative (common in ERP vendor ledgers), so negative amounts were treated as invoices and positive amounts as credits.",
      );
    }
    if (Math.min(unknownSigns.pos, unknownSigns.neg) / total > 0.2) {
      creditsTrusted = false;
      warnings.push(
        "Positive and negative amounts are mixed without a transaction type column, so credits were not used to cancel out findings. Map a transaction type column for more precise results.",
      );
    }
  } else if (hasInvoiceKind && spendSign("invoice") === -1) {
    warnings.push("Invoices in this file carry negative amounts (common in ERP vendor ledgers); signs were read accordingly.");
  }

  const minCents = Math.round(Math.max(0, settings.minAmount) * 100);
  const rows: NormalizedRow[] = [];
  const credits: NormalizedRow[] = [];
  const payments: NormalizedRow[] = [];
  for (const p of docsPre) {
    const r = p.row;
    const abs = Math.abs(p.cents);
    if (p.kind === "credit") {
      credits.push({ ...r, isCredit: true, amountCents: -abs });
      continue;
    }
    if (p.kind === "other") {
      // Journals and transfers are never duplicates themselves, but one that runs against
      // the invoices can be the entry that reversed a duplicate.
      if (Math.sign(p.cents) === -spendSign(anchorKind)) credits.push({ ...r, isCredit: true, amountCents: -abs });
      else skip("journal or transfer line");
      continue;
    }
    if (Math.sign(p.cents) !== spendSign(p.kind)) {
      credits.push({ ...r, isCredit: true, amountCents: -abs });
      continue;
    }
    if (abs < minCents) {
      skip("below the minimum amount");
      continue;
    }
    const doc = { ...r, amountCents: abs };
    if (p.kind === "payment" && hasInvoiceKind) payments.push(doc);
    else rows.push(doc);
  }
  if (payments.length) {
    warnings.push(
      `The file mixes bills and the payments that settle them. ${plural(payments.length, "payment line was", "payment lines were")} set aside so each bill is counted once; they are still used to spot bills that were also paid by a separate check or expense.`,
    );
    skip("payment line (bills checked instead)", payments.length);
  }

  return {
    rows,
    credits,
    payments,
    skipped,
    creditsTrusted,
    detected: { dateOrder, decimalSeparator: decimal, currency: detectedCurrency, lineItems: lineMode },
    warnings,
    totalRows: table.rows.length,
  };
}

// ---------------------------------------------------------------------------
// Detection

interface Pair {
  a: number;
  b: number;
  test: TestCode;
  score: number;
  /** Built lazily: most candidate pairs are merged before display. */
  reason: () => string;
  notes?: string[];
}

const INVOICE_TESTS = new Set<TestCode>(["EXACT", "INV_FORMAT", "INV_TYPO", "CROSS_VENDOR", "AMOUNT_VARIANT"]);
const STRONG = 0.6;
const MIN_SCORE = 0.4;

function recurringPeriod(dates: number[]): number | null {
  const ds = [...new Set(dates)].sort((a, b) => a - b);
  if (ds.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < ds.length; i++) gaps.push(ds[i] - ds[i - 1]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  if (med < 5) return null;
  const regular = gaps.filter((g) => Math.abs(g - med) <= Math.max(2, med * 0.25)).length / gaps.length;
  return regular >= 0.6 ? med : null;
}

function displayRow(r: NormalizedRow): FindingRow {
  return {
    line: r.line,
    vendorName: r.vendorName,
    vendorId: r.vendorId,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: daysToIso(r.invoiceDate),
    paymentDate: daysToIso(r.paymentDate),
    amountCents: r.amountCents,
    docId: r.docId,
    description: r.description,
    docType: r.docType || undefined,
  };
}

interface NumberingModel {
  prefix: string;
  /** Invoice numbers issued per day, across all of the vendor's customers. */
  rate: number;
}

/** How fast each vendor's invoice numbers climb, where they climb steadily. */
function buildNumberingModels(docs: NormalizedRow[]): Map<string, NumberingModel> {
  const byVendor = groupBy(
    docs.filter((r) => r.invLoose && (r.invoiceDate ?? r.paymentDate) !== null),
    (r) => r.vendorKey,
  );
  const out = new Map<string, NumberingModel>();
  for (const [vk, rows] of byVendor) {
    if (rows.length < 5) continue;
    const pts: { prefix: string; n: number; d: number }[] = [];
    for (const r of rows) {
      const t = numericTail(r.invLoose);
      if (t) pts.push({ prefix: t.prefix, n: t.n, d: (r.invoiceDate ?? r.paymentDate)! });
    }
    const byPrefix = groupBy(pts, (p) => p.prefix);
    let best: typeof pts = [];
    for (const g of byPrefix.values()) if (g.length > best.length) best = g;
    if (best.length < 5) continue;
    best.sort((a, b) => a.d - b.d || a.n - b.n);
    let up = 0;
    let steps = 0;
    for (let i = 1; i < best.length; i++) {
      if (best[i].d === best[i - 1].d) continue;
      steps++;
      if (best[i].n > best[i - 1].n) up++;
    }
    if (steps < 4 || up / steps < 0.75) continue;
    const lo = best[Math.floor(best.length * 0.1)];
    const hi = best[Math.min(best.length - 1, Math.ceil(best.length * 0.9))];
    const span = hi.d - lo.d;
    if (span < 7 || hi.n <= lo.n) continue;
    out.set(vk, { prefix: best[0].prefix, rate: (hi.n - lo.n) / span });
  }
  return out;
}

export function detect(norm: NormalizeOutput, settings: ScanSettings, mapping: ColumnMapping): ScanResult {
  const t0 = Date.now();
  const on = settings.tests;
  const warnings = [...norm.warnings];
  const docs = norm.rows;
  const n = docs.length;
  const dateOf = (r: NormalizedRow) => r.invoiceDate ?? r.paymentDate;
  const money = (r: NormalizedRow) => formatMoney(r.amountCents, r.currency);
  const day = (d: number | null) => daysToIso(d) ?? "an unknown date";
  const invLabel = (r: NormalizedRow) => (r.invoiceNumber ? `"${r.invoiceNumber}"` : "(blank)");

  const hasInvoices = mapping.invoiceNumber !== undefined && docs.some((r) => r.invLoose);
  const hasDates = docs.some((r) => dateOf(r) !== null);
  const hasInvDates = docs.some((r) => r.invoiceDate !== null);
  if (mapping.invoiceNumber !== undefined && !hasInvoices) {
    warnings.push("No usable invoice numbers were found, so the invoice-number checks were skipped.");
  }
  if (!hasDates) warnings.push("No readable dates were found, so the same-day and close-dates checks were skipped.");

  const pairs: Pair[] = [];
  let truncated = false;
  const add = (a: number, b: number, test: TestCode, score: number, reason: () => string, notes?: string[]) => {
    if (!on[test] || score < MIN_SCORE || a === b) return;
    pairs.push({ a, b, test, score: Math.min(0.99, score), reason, notes });
  };

  // ----- Context ---------------------------------------------------------------
  // References that repeat across months for one vendor are descriptions, not invoice numbers.
  const refKey = (r: NormalizedRow) => `${r.currency}|${r.vendorKey}|${r.invLoose}`;
  const refStats = new Map<string, { count: number; months: Set<number> }>();
  for (const r of docs) {
    if (!r.invLoose) continue;
    const k = refKey(r);
    const s = refStats.get(k) || { count: 0, months: new Set<number>() };
    s.count++;
    const d = dateOf(r);
    if (d !== null) {
      const dt = new Date(d * 86_400_000);
      s.months.add(dt.getUTCFullYear() * 12 + dt.getUTCMonth());
    }
    refStats.set(k, s);
  }
  const reuse = (r: NormalizedRow) => {
    const s = refStats.get(refKey(r));
    return s && s.count >= 3 && s.months.size >= 3 ? s.count : 0;
  };

  const models = buildNumberingModels(docs);
  /** "plausible": the vendor's own pace explains the gap; "consecutive": neighbouring numbers. */
  const sequentialVerdict = (A: NormalizedRow, B: NormalizedRow): "plausible" | "consecutive" | "no" => {
    const ta = numericTail(A.invLoose);
    const tb = numericTail(B.invLoose);
    if (!ta || !tb || ta.prefix !== tb.prefix) return "no";
    const diff = Math.abs(ta.n - tb.n);
    if (diff === 0) return "no";
    const m = models.get(A.vendorKey);
    const da = dateOf(A);
    const db = dateOf(B);
    if (m && m.prefix === ta.prefix && da !== null && db !== null) {
      const expected = m.rate * (Math.abs(da - db) + 1);
      if (diff <= expected * 3 + 10) return "plausible";
    }
    return diff <= 10 ? "consecutive" : "no";
  };

  const simCache = new Map<string, number>();
  const similarity = (x: NormalizedRow, y: NormalizedRow) => {
    if (x.vendorNameNorm === y.vendorNameNorm) return 1;
    const key = x.vendorKey < y.vendorKey ? `${x.vendorKey}\u0000${y.vendorKey}` : `${y.vendorKey}\u0000${x.vendorKey}`;
    let v = simCache.get(key);
    if (v === undefined) {
      v = vendorSimilarity(x.vendorNameNorm, y.vendorNameNorm);
      simCache.set(key, v);
    }
    return v;
  };

  const kindsNote = (A: NormalizedRow, B: NormalizedRow) =>
    A.docType && B.docType && A.docType.toLowerCase() !== B.docType.toLowerCase() ? ` (once as a ${A.docType}, once as a ${B.docType})` : "";
  const gapText = (A: NormalizedRow, B: NormalizedRow) => {
    const da = dateOf(A);
    const db = dateOf(B);
    if (da === null || db === null) return "";
    const g = Math.abs(da - db);
    return g === 0 ? ", on the same date" : `, ${plural(g, "day")} apart`;
  };

  /** Two documents that share an invoice number (exactly or once normalised). */
  const sameInvoice = (i: number, j: number, test: TestCode, base: number, why: () => string) => {
    const A = docs[i];
    const B = docs[j];
    const da = dateOf(A);
    const db = dateOf(B);
    const gap = da !== null && db !== null ? Math.abs(da - db) : null;
    const notes: string[] = [];
    let score = base;
    const reused = reuse(A);
    if (reused) {
      if (gap === null || gap > 20) return;
      score = Math.min(score, 0.66);
      notes.push(`The reference ${invLabel(A)} appears on ${reused} documents from this vendor, so it may not be a unique invoice number.`);
    }
    if (A.invoiceTotalCents && A.invoiceTotalCents === B.invoiceTotalCents && A.amountCents + B.amountCents <= A.invoiceTotalCents * 1.005 + 1) {
      return; // part payments that add up to the invoice total
    }
    if (A.partialHint || B.partialHint) {
      score = Math.min(score, 0.48);
      notes.push("The memo mentions a deposit, instalment or retention, so these may be planned part payments.");
    }
    if (gap !== null && gap > 300) {
      score = Math.min(score, 0.68);
      notes.push(`They are ${Math.round(gap / 30.4)} months apart. Check the vendor did not restart its invoice numbering.`);
    }
    if (A.invWeak) score -= 0.05;
    if (A.docId && A.docId === B.docId) notes.push(`Both lines belong to the same payment or document (${A.docId}).`);
    add(i, j, test, score, why, notes);
  };

  const typo = (i: number, j: number, mode: "inv" | "pay" | "none", gap: number) => {
    const A = docs[i];
    const B = docs[j];
    if (!A.invLoose || !B.invLoose || A.invLoose === B.invLoose) return;
    if (A.invDigits && A.invDigits === B.invDigits) return; // handled as a format variant
    const kind = oneEdit(A.invLoose, B.invLoose);
    if (!kind || kind === "equal") return;
    if (mode === "none" && kind === "substitute") return;
    const verdict = sequentialVerdict(A, B);
    if (verdict === "plausible") return;
    let score = kind === "transpose" ? 0.86 : kind === "insert" ? 0.82 : 0.78;
    if (mode === "inv" && gap > 0) score -= 0.06;
    if (mode === "pay") score -= 0.14;
    if (mode === "none") score = 0.62;
    if (Math.min(A.invLoose.length, B.invLoose.length) < 5) score -= 0.06;
    const sa = A.invStrict;
    const sb = B.invStrict;
    const suffix = sa.length === sb.length && sa.slice(0, -1) === sb.slice(0, -1) && /\p{L}/u.test(sa.slice(-1)) && /\p{L}/u.test(sb.slice(-1));
    const notes: string[] = [];
    if (suffix) notes.push("Only a letter suffix differs, which vendors also use for split or revised bills.");
    if (verdict === "consecutive") notes.push("The numbers are close together, so these may simply be two consecutive invoices.");
    if (suffix || verdict === "consecutive") score = Math.min(score, 0.45);
    if (A.partialHint || B.partialHint) score = Math.min(score, 0.45);
    const what = kind === "transpose" ? "two swapped characters" : kind === "insert" ? "one missing or extra character" : "one character";
    const when =
      mode === "inv"
        ? gap === 0
          ? "the same invoice date"
          : `invoice dates ${plural(gap, "day")} apart`
        : mode === "pay"
          ? gap === 0
            ? "paid on the same day"
            : `paid ${plural(gap, "day")} apart`
          : "no dates to compare";
    add(
      i,
      j,
      "INV_TYPO",
      score,
      () => `Invoice numbers ${invLabel(A)} and ${invLabel(B)} differ by ${what}, with the same amount (${money(A)}) and ${when}.`,
      notes,
    );
  };

  /**
   * Compare invoice numbers of documents dated within `maxGap` days of each other. Numbers one
   * edit apart share a one-deletion variant, so a sliding index over those variants finds every
   * candidate in linear time, even for vendors with thousands of same-amount invoices.
   */
  const typoWindow = (items: number[], dayOf: (i: number) => number, maxGap: number, mode: "inv" | "pay") => {
    const dated = [...items].sort((x, y) => dayOf(x) - dayOf(y));
    const live = new Map<string, number[]>();
    const variantsOf = new Map<number, string[]>();
    let start = 0;
    for (let x = 0; x < dated.length; x++) {
      const i = dated[x];
      const d = dayOf(i);
      while (start < x && d - dayOf(dated[start]) > maxGap) {
        const j = dated[start++];
        for (const v of variantsOf.get(j) ?? []) {
          const arr = live.get(v);
          if (!arr) continue;
          const pos = arr.indexOf(j);
          if (pos >= 0) arr.splice(pos, 1);
          if (!arr.length) live.delete(v);
        }
        variantsOf.delete(j);
      }
      const vs = [...new Set(deletionVariants(docs[i].invLoose))];
      const cands = new Set<number>();
      for (const v of vs) {
        const arr = live.get(v);
        if (arr) for (const j of arr) if (docs[j].invLoose !== docs[i].invLoose) cands.add(j);
      }
      for (const j of cands) typo(j, i, mode, d - dayOf(j));
      for (const v of vs) {
        const arr = live.get(v);
        if (arr) arr.push(i);
        else live.set(v, [i]);
      }
      variantsOf.set(i, vs);
    }
  };

  // ----- Same vendor and amount ------------------------------------------------
  const window = Math.max(0, Math.round(settings.nearDateWindowDays));
  const indices = Array.from({ length: n }, (_, i) => i);
  const vaBlocks = groupBy(indices, (i) => `${docs[i].currency}|${docs[i].vendorKey}|${docs[i].amountCents}`);

  for (const block of vaBlocks.values()) {
    if (block.length < 2) continue;
    block.sort((x, y) => (dateOf(docs[x]) ?? 1e9) - (dateOf(docs[y]) ?? 1e9) || docs[x].line - docs[y].line);

    if (hasInvoices) {
      // 1. Same invoice number, exactly or once normalised.
      const byLoose = groupBy(
        block.filter((i) => docs[i].invLoose),
        (i) => docs[i].invLoose,
      );
      for (const g of byLoose.values()) {
        for (let k = 1; k < g.length; k++) {
          const A = docs[g[k - 1]];
          const B = docs[g[k]];
          const exact = A.invStrict === B.invStrict;
          sameInvoice(
            g[k - 1],
            g[k],
            exact ? "EXACT" : "INV_FORMAT",
            exact ? 0.97 : 0.92,
            exact
              ? () => `Invoice ${invLabel(A)} for ${money(A)} is recorded more than once${kindsNote(A, B)}${gapText(A, B)}.`
              : () =>
                  `Invoice numbers ${invLabel(A)} and ${invLabel(B)} are the same once prefixes, punctuation, leading zeros and look-alike characters are ignored, with the same amount (${money(A)})${gapText(A, B)}.`,
          );
        }
      }

      // 2. Same digits where one number carries a prefix the other lacks ("TCS41023" vs "41023").
      const withDigits = block.filter((i) => docs[i].invDigits);
      if (withDigits.length >= 2) {
        for (const g of groupBy(withDigits, (i) => docs[i].invDigits).values()) {
          if (g.length < 2) continue;
          const reps = [...groupBy(g, (i) => docs[i].invLoose).values()].map((x) => x[0]);
          for (let x = 0; x < reps.length; x++) {
            for (let y = x + 1; y < reps.length; y++) {
              const A = docs[reps[x]];
              const B = docs[reps[y]];
              if (A.invPrefix && B.invPrefix && A.invPrefix !== B.invPrefix) continue;
              sameInvoice(
                reps[x],
                reps[y],
                "INV_FORMAT",
                0.88,
                () => `Invoice numbers ${invLabel(A)} and ${invLabel(B)} carry the same number (${A.invDigits}), one with a prefix the other lacks, with the same amount (${money(A)}).`,
              );
            }
          }
        }
      }

      // 3. Keying errors, compared only between invoices dated (almost) the same day.
      if (on.INV_TYPO) {
        const items = block.filter((i) => docs[i].invLoose.length >= 4);
        if (items.length >= 2) {
          if (hasInvDates) {
            typoWindow(
              items.filter((i) => docs[i].invoiceDate !== null),
              (i) => docs[i].invoiceDate!,
              3,
              "inv",
            );
          } else if (items.some((i) => docs[i].paymentDate !== null)) {
            typoWindow(
              items.filter((i) => docs[i].paymentDate !== null),
              (i) => docs[i].paymentDate!,
              14,
              "pay",
            );
          } else {
            // No dates at all: index one-deletion variants to find neighbours in linear time.
            const reps = [...groupBy(items, (i) => docs[i].invLoose).values()].map((x) => x[0]);
            if (reps.length <= 20_000) {
              const variants = new Map<string, number[]>();
              for (const i of reps) {
                for (const v of deletionVariants(docs[i].invLoose)) {
                  const arr = variants.get(v);
                  if (arr) arr.push(i);
                  else variants.set(v, [i]);
                }
              }
              const seen = new Set<string>();
              for (const arr of variants.values()) {
                if (arr.length < 2 || arr.length > 50) continue;
                for (let x = 0; x < arr.length; x++) {
                  for (let y = x + 1; y < arr.length; y++) {
                    const k = arr[x] < arr[y] ? `${arr[x]}|${arr[y]}` : `${arr[y]}|${arr[x]}`;
                    if (seen.has(k)) continue;
                    seen.add(k);
                    typo(arr[x], arr[y], "none", 0);
                  }
                }
              }
            } else truncated = true;
          }
        }
      }
    }

    // 4. Date evidence where an invoice number is missing.
    if (hasDates && (on.SAME_DAY || on.NEAR_DATE)) {
      const dated = block.filter((i) => dateOf(docs[i]) !== null);
      if (dated.length < 2) continue;
      // Vendors that routinely charge the same amount several times a day (fuel cards, parcels)
      // make same-day repeats meaningless.
      let sharedDays = 0;
      for (let x = 0; x < dated.length; x++) {
        const d = dateOf(docs[dated[x]]);
        if ((x > 0 && dateOf(docs[dated[x - 1]]) === d) || (x + 1 < dated.length && dateOf(docs[dated[x + 1]]) === d)) sharedDays++;
      }
      if (dated.length >= 8 && sharedDays / dated.length >= 0.3) continue;
      const period = recurringPeriod(dated.map((i) => dateOf(docs[i])!));
      let compared = 0;
      outer: for (let x = 0; x < dated.length; x++) {
        const A = docs[dated[x]];
        const da = dateOf(A)!;
        for (let y = x + 1; y < dated.length; y++) {
          const B = docs[dated[y]];
          const gap = dateOf(B)! - da;
          if (gap > window) break;
          if (++compared > 400_000) {
            truncated = true;
            break outer;
          }
          const aInv = Boolean(A.invLoose);
          const bInv = Boolean(B.invLoose);
          if (aInv && bInv) {
            if (A.invLoose === B.invLoose) continue; // the invoice checks cover it
            // Two different invoice numbers are normal, unless this vendor rarely bills this amount.
            if (gap !== 0 || !on.SAME_DAY || block.length > 3 || sequentialVerdict(A, B) !== "no") continue;
            if (oneEdit(A.invLoose, B.invLoose)) continue; // the typo check covers it
            add(
              dated[x],
              dated[y],
              "SAME_DAY",
              0.5,
              () => `${A.vendorName} billed ${money(A)} twice on ${day(da)} under different invoice numbers (${invLabel(A)} and ${invLabel(B)}). Vendors sometimes re-send a bill under a new number.`,
            );
            continue;
          }
          const invNote = aInv || bInv ? "and one of them has no invoice number" : "and neither has an invoice number";
          if (gap === 0) {
            let score = !aInv && !bInv ? 0.74 : 0.7;
            if (A.partialHint || B.partialHint) score = 0.45;
            add(dated[x], dated[y], "SAME_DAY", score, () => `${A.vendorName} was charged ${money(A)} twice on ${day(da)}, ${invNote}.`);
          } else {
            if (period) {
              const k = Math.max(1, Math.round(gap / period));
              if (Math.abs(gap - k * period) <= Math.max(2, period * 0.3)) continue;
            }
            add(
              dated[x],
              dated[y],
              "NEAR_DATE",
              !aInv && !bInv ? 0.56 : 0.52,
              () => `${A.vendorName} was charged ${money(A)} on ${day(da)} and again ${plural(gap, "day")} later, ${invNote}.`,
            );
          }
        }
      }
    }
  }

  // ----- A bill also paid by a separate check or expense -------------------------
  if (on.NEAR_DATE && hasDates && docs.some((r) => r.kind === "expense") && docs.some((r) => r.kind === "invoice")) {
    const k = (r: NormalizedRow) => `${r.currency}|${r.vendorKey}|${r.amountCents}`;
    const bills = groupBy(
      indices.filter((i) => docs[i].kind === "invoice" && dateOf(docs[i]) !== null),
      (i) => k(docs[i]),
    );
    const pays = groupBy(
      norm.payments.filter((p) => dateOf(p) !== null),
      (p) => k(p),
    );
    for (const e of indices) {
      const E = docs[e];
      if (E.kind !== "expense") continue;
      const de = dateOf(E);
      if (de === null) continue;
      const list = bills.get(k(E));
      if (!list) continue;
      const block = vaBlocks.get(k(E));
      if (block && block.length >= 4 && recurringPeriod(block.map((i) => dateOf(docs[i]) ?? 0).filter(Boolean))) continue;
      for (const b of list) {
        const B = docs[b];
        const db = dateOf(B)!;
        if (de < db - 7 || de > db + 60) continue;
        if (B.invLoose && E.invLoose && B.invLoose === E.invLoose) continue; // exact check covers it
        const p = (pays.get(k(E)) || []).find((x) => {
          const dp = dateOf(x)!;
          return dp >= db - 3 && Math.abs(dp - de) <= 30;
        });
        add(
          b,
          e,
          "NEAR_DATE",
          p ? 0.68 : 0.55,
          () =>
            `${B.vendorName}: bill ${invLabel(B)} for ${money(B)} dated ${day(db)}, and a separate ${E.docType || "payment"} for the same amount on ${day(de)}${
              p ? `, while a bill payment of ${money(B)} was also recorded on ${day(dateOf(p))}` : ""
            }.`,
        );
        break;
      }
    }
  }

  // ----- Same invoice number and amount under different vendor records -----------
  if (hasInvoices && on.CROSS_VENDOR) {
    const blocks = groupBy(
      indices.filter((i) => docs[i].invLoose && !docs[i].invWeak),
      (i) => `${docs[i].currency}|${docs[i].amountCents}|${docs[i].invLoose}`,
    );
    for (const block of blocks.values()) {
      if (block.length < 2) continue;
      const reps = [...groupBy(block, (i) => docs[i].vendorKey).values()].map((x) => x[0]);
      // A reference shared by many payees is a batch or contract number, not an invoice number.
      if (reps.length < 2 || reps.length > 3) continue;
      for (let x = 0; x < reps.length; x++) {
        for (let y = x + 1; y < reps.length; y++) {
          const A = docs[reps[x]];
          const B = docs[reps[y]];
          if (reuse(A) || reuse(B)) continue;
          const sameName = Boolean(A.vendorNameNorm) && A.vendorNameNorm === B.vendorNameNorm;
          const sim = sameName ? 1 : similarity(A, B);
          const da = dateOf(A);
          const db = dateOf(B);
          const gap = da !== null && db !== null ? Math.abs(da - db) : null;
          let score: number;
          let why: string;
          if (sameName) {
            score = 0.93;
            why = `the same vendor name under two vendor records (${A.vendorId || "no ID"} and ${B.vendorId || "no ID"})`;
          } else if (sim >= 0.9) {
            score = 0.88;
            why = `look-alike vendors "${A.vendorName}" and "${B.vendorName}" (${Math.round(sim * 100)}% similar names)`;
          } else if (sim >= 0.85) {
            score = 0.8;
            why = `similar vendors "${A.vendorName}" and "${B.vendorName}" (${Math.round(sim * 100)}% similar names)`;
          } else {
            if (gap === null || gap > 30 || A.invLoose.length < 6) continue;
            score = 0.5;
            why = `two different vendors, "${A.vendorName}" and "${B.vendorName}". It may have been paid to the wrong vendor, or be a coincidence`;
          }
          if (A.partialHint || B.partialHint) score = Math.min(score, 0.48);
          add(reps[x], reps[y], "CROSS_VENDOR", score, () => `Invoice ${invLabel(A)} for ${money(A)} was booked to ${why}.`);
        }
      }
    }
  }

  // ----- Same invoice, amounts that look like a keying slip ----------------------
  if (hasInvoices && on.AMOUNT_VARIANT) {
    const blocks = groupBy(
      indices.filter((i) => docs[i].invLoose.length >= 3),
      (i) => `${docs[i].currency}|${docs[i].vendorKey}|${docs[i].invLoose}`,
    );
    for (const block of blocks.values()) {
      if (block.length < 2 || block.length > 60) continue;
      if (reuse(docs[block[0]])) continue;
      if (block.some((i) => docs[i].partialHint)) continue;
      const total = docs[block[0]].invoiceTotalCents;
      if (total && block.reduce((a, i) => a + docs[i].amountCents, 0) <= total * 1.005 + 1) continue;
      const reps = [...groupBy(block, (i) => String(docs[i].amountCents)).values()].map((x) => x[0]);
      if (reps.length < 2) continue;
      for (let x = 0; x < reps.length; x++) {
        for (let y = x + 1; y < reps.length; y++) {
          const A = docs[reps[x]];
          const B = docs[reps[y]];
          const rel = amountRelation(A.amountCents, B.amountCents);
          if (!rel) continue;
          const score = rel === "digits transposed" ? 0.78 : rel.startsWith("one amount") ? 0.6 : rel === "near-identical amount" ? 0.62 : 0.68;
          add(
            reps[x],
            reps[y],
            "AMOUNT_VARIANT",
            score,
            () => `Invoice ${invLabel(A)} from ${A.vendorName} was booked as ${money(A)} and as ${money(B)}: ${rel}.`,
          );
        }
      }
    }
  }

  // ----- Look-alike vendor names, same amount and date ----------------------------
  if (hasDates && on.SIMILAR_VENDOR) {
    const blocks = groupBy(
      indices.filter((i) => dateOf(docs[i]) !== null),
      (i) => `${docs[i].currency}|${docs[i].amountCents}|${dateOf(docs[i])}`,
    );
    for (const block of blocks.values()) {
      if (block.length < 2) continue;
      const reps = [...groupBy(block, (i) => docs[i].vendorKey).values()].map((x) => x[0]);
      if (reps.length < 2 || reps.length > 200) continue;
      for (let x = 0; x < reps.length; x++) {
        for (let y = x + 1; y < reps.length; y++) {
          const A = docs[reps[x]];
          const B = docs[reps[y]];
          if (A.invLoose && A.invLoose === B.invLoose) continue; // the two-vendor check covers it
          if (A.vendorNameNorm[0] !== B.vendorNameNorm[0]) continue;
          const same = A.vendorNameNorm === B.vendorNameNorm;
          const sim = same ? 1 : similarity(A, B);
          if (sim < 0.9) continue;
          const different = Boolean(A.invLoose && B.invLoose);
          // Near-identical names (a plural, a typo) are a duplicate vendor record even when the
          // two bills carry different numbers; merely similar names with different numbers are weak.
          const score = different ? (sim >= 0.97 ? 0.62 : 0.5) : same ? 0.72 : 0.66;
          add(reps[x], reps[y], "SIMILAR_VENDOR", score, () =>
            same
              ? `The vendor name "${A.vendorName}" exists under two vendor records, and both were paid ${money(A)} on ${day(dateOf(A))}.`
              : `"${A.vendorName}" and "${B.vendorName}" (${Math.round(sim * 100)}% similar names) were both paid ${money(A)} on ${day(dateOf(A))}.`,
          );
        }
      }
    }
  }

  if (truncated) {
    warnings.push(
      "Some very large groups of identical amounts were only partly compared to keep the scan fast. Filter the file by vendor for a deeper check.",
    );
  }

  // ----- Groups ------------------------------------------------------------------
  pairs.sort((x, y) => y.score - x.score);
  const strongUf = new UnionFind(n);
  for (const p of pairs) if (p.score >= STRONG) strongUf.union(p.a, p.b);
  const strongSize = new Int32Array(n);
  for (let i = 0; i < n; i++) strongSize[strongUf.find(i)]++;
  const inStrong = (i: number) => strongSize[strongUf.find(i)] > 1;
  const weakUf = new UnionFind(n);
  for (const p of pairs) {
    if (p.score < STRONG && !inStrong(p.a) && !inStrong(p.b)) weakUf.union(p.a, p.b);
  }

  interface Draft {
    members: number[];
    pairs: Pair[];
  }
  const drafts = new Map<string, Draft>();
  const draftOf = (key: string) => {
    let d = drafts.get(key);
    if (!d) {
      d = { members: [], pairs: [] };
      drafts.set(key, d);
    }
    return d;
  };
  for (const p of pairs) {
    if (inStrong(p.a) || inStrong(p.b)) {
      const ra = strongUf.find(p.a);
      if (ra !== strongUf.find(p.b)) continue; // a weak link between separate groups
      draftOf(`s${ra}`).pairs.push(p);
    } else {
      draftOf(`w${weakUf.find(p.a)}`).pairs.push(p);
    }
  }
  for (let i = 0; i < n; i++) {
    if (inStrong(i)) draftOf(`s${strongUf.find(i)}`).members.push(i);
    else {
      const k = `w${weakUf.find(i)}`;
      if (drafts.has(k)) drafts.get(k)!.members.push(i);
    }
  }

  // Credits available to offset findings
  const creditIndex = new Map<string, NormalizedRow[]>();
  if (norm.creditsTrusted) {
    for (const c of norm.credits) {
      const k = `${c.currency}|${c.vendorKey}|${Math.abs(c.amountCents)}`;
      const arr = creditIndex.get(k);
      if (arr) arr.push(c);
      else creditIndex.set(k, [c]);
    }
  }
  const usedCredits = new Set<number>();

  const findings: Finding[] = [];
  const draftList = [...drafts.entries()]
    .filter(([, d]) => d.members.length >= 2 && d.pairs.length > 0)
    .map(([k, d]) => ({ weak: k.startsWith("w"), ...d }))
    .sort((x, y) => y.pairs[0].score - x.pairs[0].score);

  for (const d of draftList) {
    const memberRows = d.members.map((i) => docs[i]).sort((x, y) => x.line - y.line);
    const best = d.pairs[0];
    const tests = new Set(d.pairs.map((p) => p.test));
    const invoiceLinked = [...tests].some((t) => INVOICE_TESTS.has(t));
    const pattern = (!invoiceLinked && memberRows.length >= 4) || (d.weak && memberRows.length >= 3);
    const amounts = memberRows.map((r) => r.amountCents);
    const maxAmount = Math.max(...amounts);
    const sum = amounts.reduce((a, b) => a + b, 0);
    let exposure = pattern ? maxAmount : sum - maxAmount;
    const score = pattern ? Math.min(best.score, 0.4) : best.score;
    const currency = memberRows[0].currency;
    const reasons: string[] = [];
    if (pattern) {
      reasons.push(
        `${memberRows.length} charges of ${formatMoney(maxAmount, currency)} close together. This is often a regular or batch charge; review it only if it is unexpected.`,
      );
    }
    for (const p of d.pairs) {
      const r = p.reason();
      if (!reasons.includes(r)) reasons.push(r);
      if (reasons.length >= 3) break;
    }
    for (const p of d.pairs) for (const note of p.notes ?? []) if (!reasons.includes(note) && reasons.length < 5) reasons.push(note);

    // Credit notes and reversals that cancel the duplicate
    const offsets: NormalizedRow[] = [];
    if (creditIndex.size) {
      const needed = pattern ? 1 : memberRows.length - 1;
      const vendorKeys = new Set(memberRows.map((r) => r.vendorKey));
      const invKeys = new Set(memberRows.map((r) => r.invLoose).filter(Boolean));
      const rawInvs = memberRows.map((r) => r.invoiceNumber.toUpperCase()).filter((s) => s.length >= 4);
      const dates = memberRows.map(dateOf).filter((x): x is number => x !== null);
      const minDate = dates.length ? Math.min(...dates) : null;
      const maxDate = dates.length ? Math.max(...dates) : null;
      const candidates: { c: NormalizedRow; match: boolean; dist: number }[] = [];
      for (const vk of vendorKeys) {
        for (const amt of new Set(amounts)) {
          for (const c of creditIndex.get(`${currency}|${vk}|${amt}`) || []) {
            if (usedCredits.has(c.idx)) continue;
            const text = `${c.invoiceNumber} ${c.description}`.toUpperCase();
            const match = Boolean((c.invLoose && invKeys.has(c.invLoose)) || rawInvs.some((s) => text.includes(s)));
            const cd = dateOf(c);
            const dateOk = cd !== null && minDate !== null && maxDate !== null && cd >= minDate - 7 && cd <= maxDate + 120;
            if (match || dateOk) candidates.push({ c, match, dist: cd !== null && minDate !== null ? Math.abs(cd - minDate) : 9999 });
          }
        }
      }
      candidates.sort((x, y) => Number(y.match) - Number(x.match) || x.dist - y.dist);
      for (const { c } of candidates) {
        if (offsets.length >= needed) break;
        offsets.push(c);
        usedCredits.add(c.idx);
        exposure -= Math.abs(c.amountCents);
      }
      exposure = Math.max(0, exposure);
    }
    const reversed = offsets.length > 0 && exposure === 0;
    if (offsets.length) {
      reasons.push(
        reversed
          ? `A matching credit (${offsets.map((o) => `line ${o.line}`).join(", ")}) appears to reverse it, so it is probably already corrected.`
          : `${plural(offsets.length, "matching credit")} reduce the amount at stake.`,
      );
    }
    const signature = memberRows
      .map((r) => `${r.vendorKey}|${r.invStrict}|${r.amountCents}|${dateOf(r) ?? ""}`)
      .sort()
      .join("~");
    findings.push({
      id: hash53(`${best.test}|${signature}`),
      test: best.test,
      alsoMatched: [...tests].filter((t) => t !== best.test),
      score: Math.round(score * 100) / 100,
      confidence: confidenceOf(score),
      currency,
      amountCents: maxAmount,
      exposureCents: exposure,
      vendor: memberRows[0].vendorName,
      reasons,
      rows: memberRows.map(displayRow),
      offsets: offsets.map(displayRow),
      reversed,
    });
  }

  findings.sort((x, y) => {
    if (x.reversed !== y.reversed) return x.reversed ? 1 : -1;
    const c = CONF_RANK[x.confidence] - CONF_RANK[y.confidence];
    if (c) return c;
    return y.exposureCents - x.exposureCents || x.rows[0].line - y.rows[0].line;
  });

  // ----- Stats ---------------------------------------------------------------------
  const byTest = Object.fromEntries(TESTS.map((t) => [t.code, { count: 0, exposureCents: 0 }])) as ScanStats["byTest"];
  const byConfidence: ScanStats["byConfidence"] = {
    high: { count: 0, exposureCents: 0 },
    medium: { count: 0, exposureCents: 0 },
    low: { count: 0, exposureCents: 0 },
  };
  const currencyMap = new Map<string, { scannedCents: number; exposureCents: number; highExposureCents: number; lowExposureCents: number }>();
  const cur = (c: string) => {
    let v = currencyMap.get(c);
    if (!v) {
      v = { scannedCents: 0, exposureCents: 0, highExposureCents: 0, lowExposureCents: 0 };
      currencyMap.set(c, v);
    }
    return v;
  };
  for (const r of docs) cur(r.currency).scannedCents += r.amountCents;
  let reversedCount = 0;
  for (const f of findings) {
    if (f.reversed) {
      reversedCount++;
      continue;
    }
    byTest[f.test].count++;
    byTest[f.test].exposureCents += f.exposureCents;
    byConfidence[f.confidence].count++;
    byConfidence[f.confidence].exposureCents += f.exposureCents;
    const c = cur(f.currency);
    if (f.confidence === "low") c.lowExposureCents += f.exposureCents;
    else c.exposureCents += f.exposureCents;
    if (f.confidence === "high") c.highExposureCents += f.exposureCents;
  }
  const currencies = [...currencyMap.entries()]
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => b.scannedCents - a.scannedCents);
  if (currencies.length > 1) {
    warnings.push(
      `The file contains ${currencies.length} currencies. Amounts are only compared within the same currency, and totals are shown per currency.`,
    );
  }
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const r of docs) {
    const d = dateOf(r);
    if (d === null) continue;
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  }
  const skippedTotal = Object.entries(norm.skipped)
    .filter(([k]) => k !== "blank line" && k !== "heading or title line")
    .reduce((a, [, v]) => a + v, 0);

  const stats: ScanStats = {
    rowsTotal: norm.totalRows,
    rowsUsed: docs.length,
    rowsSkipped: skippedTotal,
    skippedReasons: norm.skipped,
    credits: norm.credits.length,
    vendors: new Set(docs.map((r) => r.vendorKey)).size,
    dateMin: Number.isFinite(dMin) ? daysToIso(dMin) : null,
    dateMax: Number.isFinite(dMax) ? daysToIso(dMax) : null,
    currencies,
    primaryCurrency: currencies[0]?.currency || norm.detected.currency,
    findings: findings.length - reversedCount,
    reversedFindings: reversedCount,
    byTest,
    byConfidence,
    durationMs: Date.now() - t0,
  };

  return { findings, stats, warnings, settings, mapping, detected: norm.detected };
}

/** Normalise and detect in one go. */
export function runScan(table: RawTable, mapping: ColumnMapping, settings: ScanSettings): ScanResult {
  const t0 = Date.now();
  const norm = normalizeTable(table, mapping, settings);
  const result = detect(norm, settings, mapping);
  result.stats.durationMs = Date.now() - t0;
  return result;
}
