// Real-world shapes of AP data that once fooled the engine. Each case is a small file with
// a known right answer: a duplicate that must be found, or a pattern that must stay quiet.

import { describe, expect, it } from "vitest";
import { runScan } from "../lib/engine/detect";
import { autoMap } from "../lib/engine/mapping";
import { gridToTable, readFileBytes } from "../lib/engine/readers";
import { parseAmountCents, detectDecimalSeparator, normalizeCurrency } from "../lib/engine/parse";
import { normalizeVendor, vendorSimilarity } from "../lib/engine/normalize";
import { DEFAULT_SETTINGS, GROUP_HEADINGS, type ColumnMapping, type ScanResult } from "../lib/engine/types";

const H = ["Vendor ID", "Vendor", "Type", "Invoice No", "Invoice Date", "Payment Date", "Amount", "Currency", "Doc ID", "Memo"];
const MAP: ColumnMapping = {
  vendorId: 0, vendorName: 1, docType: 2, invoiceNumber: 3, invoiceDate: 4, paymentDate: 5, amount: 6, currency: 7, docId: 8, description: 9,
};
interface R {
  vid?: string; v: string; type?: string; inv?: string; idate?: string; pdate?: string; amt: string; cur?: string; doc?: string; memo?: string;
}
function run(rows: R[], map: ColumnMapping = MAP): ScanResult {
  const table = {
    headers: H,
    headerLine: 1,
    rows: rows.map((r) => [r.vid ?? "", r.v, r.type ?? "", r.inv ?? "", r.idate ?? "", r.pdate ?? "", r.amt, r.cur ?? "", r.doc ?? "", r.memo ?? ""]),
  };
  return runScan(table, map, DEFAULT_SETTINGS);
}
const open = (r: ScanResult) => r.findings.filter((f) => !f.reversed);
const notLow = (r: ScanResult) => open(r).filter((f) => f.confidence !== "low");
const iso = (m: number, d = 1) => `2025-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const monthly = (v: string, amt: string, inv: (m: number) => string): R[] =>
  Array.from({ length: 12 }, (_, i) => ({ vid: "V9", v, type: "Bill", inv: inv(i + 1), idate: iso(i + 1), amt }));

describe("duplicates that must be found", () => {
  it("exact duplicate", () => {
    const r = run([
      { vid: "V1", v: "Acme Corp", inv: "INV-1001", idate: "2025-03-01", amt: "1,234.56" },
      { vid: "V1", v: "Acme Corp", inv: "INV-1001", idate: "2025-03-01", amt: "1,234.56" },
    ]);
    expect(open(r)).toHaveLength(1);
    expect(open(r)[0]).toMatchObject({ test: "EXACT", confidence: "high", exposureCents: 123456 });
  });

  it("format variants form one group with the right exposure", () => {
    const r = run([
      { vid: "V1", v: "Acme", inv: "INV-00123", idate: "2025-03-01", amt: "500.00" },
      { vid: "V1", v: "Acme", inv: "123", idate: "2025-03-05", amt: "500.00" },
      { vid: "V1", v: "Acme", inv: "inv 123", idate: "2025-03-09", amt: "500.00" },
      { vid: "V1", v: "Acme", inv: "INV-O0123", idate: "2025-03-11", amt: "500.00" },
    ]);
    expect(open(r)).toHaveLength(1);
    expect(open(r)[0].rows).toHaveLength(4);
    expect(open(r)[0].exposureCents).toBe(150000);
  });

  it("OCR look-alikes and keying errors on the same invoice date", () => {
    const r = run([
      { vid: "V1", v: "Acme", inv: "48213", idate: "2025-03-01", amt: "700.00" },
      { vid: "V1", v: "Acme", inv: "48231", idate: "2025-03-01", amt: "700.00" },
      { vid: "V2", v: "Beta", inv: "40018", idate: "2025-03-01", amt: "800.00" },
      { vid: "V2", v: "Beta", inv: "4OO18", idate: "2025-03-05", amt: "800.00" },
      { vid: "V3", v: "Gamma", inv: "55120", idate: "2025-03-01", amt: "990.00" },
      { vid: "V3", v: "Gamma", inv: "551200", idate: "2025-03-02", amt: "990.00" },
    ]);
    const tests = open(r).map((f) => `${f.vendor}:${f.test}`).sort();
    expect(tests).toEqual(["Acme:INV_TYPO", "Beta:INV_FORMAT", "Gamma:INV_TYPO"]);
  });

  it("duplicate vendor records with the same invoice", () => {
    const r = run([
      { vid: "V1", v: "Acme Corp", inv: "A-55012", idate: "2025-03-01", amt: "2,500.00" },
      { vid: "V7", v: "ACME Corporation", inv: "A-55012", idate: "2025-03-09", amt: "2,500.00" },
    ]);
    expect(open(r)[0]).toMatchObject({ test: "CROSS_VENDOR", confidence: "high" });
  });

  it("same amount and date with no invoice number", () => {
    const r = run([
      { vid: "V1", v: "Acme", idate: "2025-03-01", amt: "640.00" },
      { vid: "V1", v: "Acme", idate: "2025-03-01", amt: "640.00" },
    ]);
    expect(open(r)[0]).toMatchObject({ test: "SAME_DAY", confidence: "medium" });
  });

  it("triplicates count two extra payments, and overlapping checks never double count", () => {
    const tri = run([
      { vid: "V1", v: "Acme", inv: "T-9001", idate: "2025-03-01", amt: "300.00" },
      { vid: "V1", v: "Acme", inv: "T-9001", idate: "2025-03-02", amt: "300.00" },
      { vid: "V1", v: "Acme", inv: "T-9001", idate: "2025-03-03", amt: "300.00" },
    ]);
    expect(tri.stats.currencies[0].exposureCents).toBe(60000);
    const mixed = run([
      { vid: "V1", v: "Acme", inv: "Q-1001", idate: "2025-03-01", amt: "400.00" },
      { vid: "V1", v: "Acme", inv: "Q-1001", idate: "2025-03-01", amt: "400.00" },
      { vid: "V1", v: "Acme", inv: "", idate: "2025-03-01", amt: "400.00" },
    ]);
    expect(mixed.stats.currencies[0].exposureCents).toBe(80000);
    const variants = run([
      { vid: "V1", v: "Acme", inv: "Z-5001", idate: "2025-03-01", amt: "1,000.00" },
      { vid: "V1", v: "Acme", inv: "Z-5001", idate: "2025-03-02", amt: "1,001.00" },
      { vid: "V1", v: "Acme", inv: "Z-5001", idate: "2025-03-03", amt: "1,002.00" },
    ]);
    expect(variants.stats.currencies[0].exposureCents).toBe(200100);
  });

  it("a matching credit reverses a duplicate; an unrelated one does not", () => {
    const reversed = run([
      { vid: "V1", v: "Acme", type: "Bill", inv: "R-1001", idate: "2025-03-01", amt: "300.00" },
      { vid: "V1", v: "Acme", type: "Bill", inv: "R-1001", idate: "2025-03-02", amt: "300.00" },
      { vid: "V1", v: "Acme", type: "Vendor Credit", inv: "CN-1", idate: "2025-03-20", amt: "-300.00" },
    ]);
    expect(reversed.findings[0].reversed).toBe(true);
    const unrelated = run([
      { vid: "V1", v: "Acme", type: "Bill", inv: "R-1001", idate: "2025-01-10", amt: "500.00" },
      { vid: "V1", v: "Acme", type: "Bill", inv: "R-1001", idate: "2025-01-12", amt: "500.00" },
      { vid: "V1", v: "Acme", type: "Vendor Credit", inv: "RMA-77", idate: "2025-12-15", amt: "-500.00", memo: "Returned goods" },
    ]);
    expect(unrelated.findings[0].reversed).toBe(false);
  });

  it("QuickBooks: bill entered twice and paid twice by card is not 'reversed'", () => {
    const r = run([
      { v: "Northwind", type: "Bill", inv: "NW-4410", idate: "2025-03-01", amt: "2,750.00" },
      { v: "Northwind", type: "Bill", inv: "NW-4410", idate: "2025-03-03", amt: "2,750.00" },
      { v: "Northwind", type: "Bill Payment (Credit Card)", idate: "2025-03-20", amt: "-2,750.00" },
      { v: "Northwind", type: "Bill Payment (Credit Card)", idate: "2025-03-21", amt: "-2,750.00" },
    ]);
    expect(open(r)[0]).toMatchObject({ test: "EXACT", reversed: false, exposureCents: 275000 });
  });

  it("QuickBooks: a bill also paid with a hand-written check", () => {
    const r = run([
      { v: "Northwind", type: "Bill", inv: "NW-4411", idate: "2025-03-01", amt: "3,100.00" },
      { v: "Northwind", type: "Bill Payment (Check)", idate: "2025-03-20", amt: "-3,100.00" },
      { v: "Northwind", type: "Check", inv: "NW-4411", idate: "2025-03-02", amt: "3,100.00" },
    ]);
    expect(open(r)[0]).toMatchObject({ test: "EXACT", exposureCents: 310000 });
    const byCheckNumber = run([
      { v: "Northwind", type: "Bill", inv: "NW-4412", idate: "2025-03-01", amt: "3,300.00" },
      { v: "Northwind", type: "Bill Payment (Check)", idate: "2025-03-20", amt: "-3,300.00" },
      { v: "Northwind", type: "Check", inv: "10234", idate: "2025-03-22", amt: "3,300.00" },
    ]);
    expect(open(byCheckNumber)[0]).toMatchObject({ test: "NEAR_DATE", confidence: "medium" });
  });

  it("QuickBooks: the same card charge twice, and a duplicate reversed by a journal entry", () => {
    const card = run([
      { v: "Relecloud Software", type: "Credit Card Expense", idate: "2025-03-05", amt: "1,890.00" },
      { v: "Relecloud Software", type: "Credit Card Expense", idate: "2025-03-05", amt: "1,890.00" },
    ]);
    expect(open(card)[0]).toMatchObject({ test: "SAME_DAY", exposureCents: 189000 });
    const je = run([
      { v: "Northwind", type: "Bill", inv: "NW-7701", idate: "2025-03-01", amt: "640.00" },
      { v: "Northwind", type: "Bill", inv: "NW-7701", idate: "2025-03-02", amt: "640.00" },
      { v: "Northwind", type: "Journal Entry", idate: "2025-03-10", amt: "-640.00", memo: "reverse duplicate bill" },
    ]);
    expect(je.findings[0].reversed).toBe(true);
  });
});

describe("patterns that must stay quiet", () => {
  it.each([
    ["sequential monthly numbers", (m: number) => `${1000 + m}`],
    ["RENT-JAN-2025", (m: number) => `RENT-${MONTHS[m - 1]}-2025`],
    ["Jan 2025", (m: number) => `${MONTHS[m - 1]} 2025`],
    ["policy number + month", (m: number) => `POL-778812 ${MONTHS[m - 1]}`],
    ["constant reference RENT", () => "RENT"],
    ["date as number", (m: number) => `2025${String(m).padStart(2, "0")}01`],
    ["N/2025", (m: number) => `${m}/2025`],
    ["RENTJUN25", (m: number) => `RENT${MONTHS[m - 1]}25`],
    ["account number reused", () => "ACCT 778812"],
  ])("recurring charge: %s", (_name, inv) => {
    expect(open(run(monthly("Alpine Property", "12,500.00", inv)))).toHaveLength(0);
  });

  it("weekly charges", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      vid: "V5", v: "Woodgrove Cleaning", inv: `WK${String(i + 1).padStart(2, "0")}-2025`,
      idate: new Date(Date.UTC(2025, 0, 3 + 7 * i)).toISOString().slice(0, 10), amt: "465.00",
    }));
    expect(open(run(rows))).toHaveLength(0);
  });

  it("short invoice numbers across different vendors", () => {
    const r = run([
      { vid: "V1", v: "Acme", inv: "1", idate: "2025-03-01", amt: "100.00" },
      { vid: "V2", v: "Globex", inv: "1", idate: "2025-04-01", amt: "100.00" },
      { vid: "V5", v: "Umbrella", inv: "1001", idate: "2025-03-01", amt: "1,000.00" },
      { vid: "V6", v: "Wayne Enterprises", inv: "1001", idate: "2025-06-01", amt: "1,000.00" },
    ]);
    expect(notLow(r)).toHaveLength(0);
  });

  it("different currencies never match, however the currency is written", () => {
    for (const [a, b] of [["USD", "EUR"], ["$", "€"], ["US Dollar", "Euro"]]) {
      const r = run([
        { vid: "V1", v: "Acme", inv: "X-7001", idate: "2025-03-01", amt: "1,000.00", cur: a },
        { vid: "V1", v: "Acme", inv: "X-7001", idate: "2025-03-01", amt: "1,000.00", cur: b },
      ]);
      expect(open(r)).toHaveLength(0);
    }
  });

  it("planned part payments", () => {
    const halves = run([
      { vid: "V1", v: "Stark Construction", inv: "SC-9001", idate: "2025-02-15", amt: "5,000.00", memo: "Deposit 50%" },
      { vid: "V1", v: "Stark Construction", inv: "SC-9001", idate: "2025-02-15", amt: "5,000.00", memo: "Balance payment" },
    ]);
    expect(notLow(halves)).toHaveLength(0);
    const partial = run([
      { vid: "V1", v: "Stark Construction", inv: "SC-9002", idate: "2025-02-15", amt: "9,000.00" },
      { vid: "V1", v: "Stark Construction", inv: "SC-9002", idate: "2025-02-15", amt: "1,000.00" },
    ]);
    expect(open(partial)).toHaveLength(0);
  });

  it("sequential invoices from a busy vendor, and split bills with letter suffixes", () => {
    const rows: R[] = [];
    for (let i = 0; i < 40; i++) {
      rows.push({ vid: "V1", v: "Umber Printers", inv: `IN${803000 + i * 14}`, idate: iso(4, 1 + (i % 28)), amt: `${1000 + i}.00` });
    }
    rows.push({ vid: "V1", v: "Umber Printers", inv: "IN803244", idate: "2025-05-07", amt: "2,500.00" });
    rows.push({ vid: "V1", v: "Umber Printers", inv: "IN803424", idate: "2025-05-20", amt: "2,500.00" });
    rows.push({ vid: "V2", v: "Hartley Fabrication", inv: "PO4500012345-A", idate: "2025-05-07", amt: "8,000.00" });
    rows.push({ vid: "V2", v: "Hartley Fabrication", inv: "PO4500012345-B", idate: "2025-05-07", amt: "8,000.00" });
    expect(notLow(run(rows))).toHaveLength(0);
  });

  it("SAP: an invoice and its reversal posted with the same document type", () => {
    const r = run([
      { vid: "100023", v: "ACME GMBH", type: "RE", inv: "RE-2025-77", idate: "2025-03-12", amt: "-1.234,56", cur: "EUR", doc: "5100000123" },
      { vid: "100023", v: "ACME GMBH", type: "RE", inv: "RE-2025-77", idate: "2025-03-12", amt: "1.234,56", cur: "EUR", doc: "5100000187" },
      { vid: "100023", v: "ACME GMBH", type: "RE", inv: "RE-2025-78", idate: "2025-03-13", amt: "-99,00", cur: "EUR", doc: "5100000124" },
    ]);
    expect(open(r)).toHaveLength(0);
  });

  it("purchase orders are not documents", () => {
    const r = run([
      { v: "Contoso", type: "Purchase Order", idate: "2025-03-01", amt: "4,000.00" },
      { v: "Contoso", type: "Bill", idate: "2025-03-01", amt: "4,000.00" },
    ]);
    expect(open(r)).toHaveLength(0);
  });

  it("non-Latin vendor names stay distinct", () => {
    const r = run(
      [
        { v: "ООО Ромашка", idate: "2025-03-01", amt: "15 000,00" },
        { v: "ООО Василёк", idate: "2025-03-01", amt: "15 000,00" },
        { v: "北京科技有限公司", inv: "A-77881", idate: "2025-03-02", amt: "8 800,00" },
        { v: "上海贸易有限公司", inv: "A-77881", idate: "2025-04-02", amt: "8 800,00" },
      ],
      { vendorName: 1, invoiceNumber: 3, invoiceDate: 4, amount: 6 },
    );
    expect(open(r)).toHaveLength(0);
  });

  it("batch billing of identical amounts", () => {
    const r = run(
      ["SSP-5001", "SSP-5002", "SSP-5003", "SSP-5004"].map((inv) => ({ vid: "V3", v: "Summit Staffing", inv, idate: "2025-03-07", amt: "1,440.00" })),
    );
    expect(notLow(r)).toHaveLength(0);
  });

  it("numbered locations of one chain are different payees", () => {
    const r = run([
      { vid: "L1", v: "Starbucks #123", inv: "880012", idate: "2025-03-01", amt: "250.00" },
      { vid: "L2", v: "Starbucks #456", inv: "880012", idate: "2025-03-01", amt: "250.00" },
    ]);
    expect(notLow(r)).toHaveLength(0);
  });

  it("a reference shared by many payees (a batch id) does not blow up", () => {
    const rows: R[] = Array.from({ length: 3000 }, (_, i) => ({ vid: `E${i}`, v: `Employee ${i}`, inv: "EXP-2025-03", idate: "2025-03-31", amt: "50.00" }));
    const t0 = Date.now();
    const r = run(rows);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(notLow(r)).toHaveLength(0);
  });
});

describe("file shapes", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const scanText = (name: string, text: string) => {
    const grid = readFileBytes(name, enc(text)).sheets[0].grid;
    const t = gridToTable(grid);
    const m = autoMap(t.headers, t.rows);
    return { m, t, r: runScan(t, m, DEFAULT_SETTINGS) };
  };

  it("QuickBooks Transaction List by Vendor (vendor on heading rows)", () => {
    const csv = [
      "Harbor & Pine Manufacturing",
      "Transaction List by Vendor",
      "January - December 2025",
      "",
      ",Date,Transaction Type,Num,Posting,Memo/Description,Account,Amount",
      "Northwind Traders,,,,,,,",
      ",01/05/2025,Bill,1042,Yes,Parts,Accounts Payable,\"1,200.00\"",
      ",01/19/2025,Bill,1042,Yes,Parts,Accounts Payable,\"1,200.00\"",
      ",01/30/2025,Bill Payment (Check),,Yes,,Checking,\"-1,200.00\"",
      "Total for Northwind Traders,,,,,,,\"1,200.00\"",
      "Total Quality Logistics,,,,,,,",
      ",02/03/2025,Bill,TQL-88,Yes,Freight,Accounts Payable,640.00",
      "Total for Total Quality Logistics,,,,,,,640.00",
      "TOTAL,,,,,,,\"1,840.00\"",
    ].join("\n");
    const { m, r } = scanText("qbo.csv", csv);
    expect(m.vendorName).toBe(GROUP_HEADINGS);
    expect(m.invoiceNumber).toBe(3);
    expect(r.stats.rowsUsed).toBe(3);
    expect(open(r)).toHaveLength(1);
    expect(open(r)[0]).toMatchObject({ test: "EXACT", vendor: "Northwind Traders", exposureCents: 120000 });
  });

  it("Xero bills export (one row per line) folds lines into bills", () => {
    const csv = [
      "ContactName,InvoiceNumber,InvoiceDate,Total,Description,Quantity,UnitAmount,LineAmount,Status",
      "Coho Packaging,CP-4471,2025-03-01,600.00,Boxes,10,50.00,500.00,PAID",
      "Coho Packaging,CP-4471,2025-03-01,600.00,Freight,1,100.00,100.00,PAID",
      "Coho Packaging,CP-4480,2025-03-04,90.00,Tape,3,30.00,90.00,PAID",
      "Coho Packaging,CP-4471,2025-03-01,600.00,Boxes,10,50.00,500.00,AUTHORISED",
      "Coho Packaging,CP-4471,2025-03-01,600.00,Freight,1,100.00,100.00,AUTHORISED",
      "Coho Packaging,CP-4490,2025-03-09,75.00,Labels,1,75.00,75.00,VOIDED",
    ].join("\n");
    const { m, r } = scanText("xero.csv", csv);
    expect(m.amount).toBe(3);
    expect(m.status).toBe(8);
    expect(r.detected.lineItems).toBe(true);
    expect(open(r)).toHaveLength(1);
    expect(open(r)[0]).toMatchObject({ test: "EXACT", exposureCents: 60000 });
    expect(r.stats.skippedReasons["void, deleted or cancelled"]).toBe(1);
  });

  it("the same invoice twice on one check is found, partial payments are not", () => {
    const twice = scanText(
      "run.csv",
      "Check No,Payment Date,Vendor,Invoice No,Invoice Date,Amount Paid\n100231,03/28/2025,Granite Peak,GX-88412,03/01/2025,\"7,450.00\"\n100231,03/28/2025,Granite Peak,GX-88412,03/01/2025,\"7,450.00\"\n100231,03/28/2025,Granite Peak,GX-88413,03/02/2025,99.00\n",
    );
    expect(open(twice.r)[0]).toMatchObject({ test: "EXACT", exposureCents: 745000 });
    const partial = scanText(
      "run.csv",
      "Check No,Payment Date,Vendor,Invoice No,Invoice Date,Invoice Amount,Amount Paid\n100231,03/28/2025,Stark,SC-9001,03/01/2025,\"10,000.00\",\"6,000.00\"\n100290,04/28/2025,Stark,SC-9001,03/01/2025,\"10,000.00\",\"6,000.00\"\n",
    );
    expect(partial.m.invoiceTotal).toBe(5);
    expect(open(partial.r)).toHaveLength(1); // 6,000 + 6,000 exceeds the 10,000 invoice
    const fine = scanText(
      "run.csv",
      "Check No,Payment Date,Vendor,Invoice No,Invoice Date,Invoice Amount,Amount Paid\n100231,03/28/2025,Stark,SC-9001,03/01/2025,\"10,000.00\",\"5,000.00\"\n100290,04/28/2025,Stark,SC-9001,03/01/2025,\"10,000.00\",\"5,000.00\"\n",
    );
    expect(open(fine.r)).toHaveLength(0);
  });

  it("debit and credit columns", () => {
    const { m, r } = scanText(
      "ledger.csv",
      "Date,Vendor,Reference,Debit,Credit\n03/01/2025,Acme,INV-5501,,\"1,000.00\"\n03/02/2025,Acme,INV-5501,,\"1,000.00\"\n03/20/2025,Acme,PMT-1,\"1,000.00\",\n",
    );
    expect(m.creditAmount).toBe(4);
    expect(r.stats.rowsUsed).toBeGreaterThanOrEqual(2);
    expect(open(r)[0]).toMatchObject({ test: "EXACT", exposureCents: 100000 });
  });

  it("a UTF-8 BOM followed by a stray Windows byte keeps clean headers", () => {
    const head = enc("﻿Vendor,Invoice No,Invoice Date,Amount\nCaf");
    const bytes = new Uint8Array([...head, 0xe9, ...enc(" Paris,INV-9,01/16/2025,10.00\n")]);
    const grid = readFileBytes("x.csv", bytes).sheets[0].grid;
    expect(grid[0][0]).toBe("Vendor");
  });
});

describe("value parsing edge cases", () => {
  it.each([
    ["$(1,234.56)", ".", -123456],
    ["USD (1,234.56)", ".", -123456],
    ["USD1,234.56", ".", 123456],
    ["US$1,234.56", ".", 123456],
    ["1’234.50", ".", 123450],
    ["CHF 1'234.50", ".", 123450],
    ["Rs. 1,234.00", ".", 123400],
    ["₹1,23,456.00", ".", 12345600],
    ["kr 1.234,56", ",", 123456],
    ["1,234.56 CNY", ".", 123456],
    ["CR 1,234.56", ".", -123456],
    ["1,234.56 Cr", ".", -123456],
    ["--5", ".", null],
    ["12 345 678,90", ",", 1234567890],
    ["1234.5600000000002", ".", 123456],
  ] as [string, "." | ",", number | null][])("%s", (raw, dec, expected) => {
    expect(parseAmountCents(raw, dec)).toBe(expected);
  });

  it("three-decimal exports are not read as thousands", () => {
    expect(detectDecimalSeparator(["100.000", "250.500", "75.250", "1234.500", "12.000"])).toBe(".");
    expect(detectDecimalSeparator(["1.234", "12.500", "500", "3.000"])).toBe(",");
  });

  it("currency cells", () => {
    expect(normalizeCurrency("$")).toBe("USD");
    expect(normalizeCurrency("Euro")).toBe("EUR");
    expect(normalizeCurrency("Pound Sterling")).toBe("GBP");
    expect(normalizeCurrency("cad")).toBe("CAD");
  });

  it("vendor names", () => {
    expect(normalizeVendor("AB Electric")).not.toBe(normalizeVendor("Electric Co"));
    expect(normalizeVendor("Acme, L.L.C.")).toBe("ACME");
    expect(normalizeVendor("ООО Ромашка")).toBe("РОМАШКА");
    expect(vendorSimilarity(normalizeVendor("Smith Plumbing"), normalizeVendor("Smith Roofing"))).toBeLessThanOrEqual(0.8);
    expect(vendorSimilarity(normalizeVendor("Valemont Water Co"), normalizeVendor("Valemont Waste LLC"))).toBeLessThanOrEqual(0.84);
    expect(vendorSimilarity(normalizeVendor("Oakridge Networks"), normalizeVendor("Oakridge Media"))).toBeLessThanOrEqual(0.84);
    expect(vendorSimilarity(normalizeVendor("Tailspin Courier Services"), normalizeVendor("Tailspin Courier Service"))).toBeGreaterThan(0.95);
  });
});
