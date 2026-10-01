import { describe, expect, it } from "vitest";
import { parseAmountCents, parseDateDays, detectDateOrder, detectDecimalSeparator, daysToIso } from "../lib/engine/parse";
import { invoiceKeys, oneEdit, amountRelation, normalizeVendor, vendorSimilarity } from "../lib/engine/normalize";
import { autoMap, detectHeaderRow } from "../lib/engine/mapping";
import { gridToTable, readFileBytes, parseDelimited } from "../lib/engine/readers";
import { runScan } from "../lib/engine/detect";
import { buildXlsx, toCsv } from "../lib/engine/xlsx-writer";
import { DEFAULT_SETTINGS, type ScanResult } from "../lib/engine/types";
const CITIES = ["Austin","Boston","Chicago","Denver","Eugene","Fresno","Galway","Houston","Irvine","Jackson","Kent","Leeds","Madison","Nashville","Oxford","Portland","Quincy","Reno","Salem","Tampa","Utica","Vegas","Wichita","York"];
import { generateSample, sampleToGrid, type SampleRow } from "../lib/sample/generate";

describe("amount parsing", () => {
  const cases: [string, "." | ",", number | null][] = [
    ["1,234.56", ".", 123456],
    ["1.234,56", ",", 123456],
    ["1 234,56", ",", 123456],
    ["$1,234.56", ".", 123456],
    ["£1,234.56", ".", 123456],
    ["€1.234,56", ",", 123456],
    ["USD 1,234.56", ".", 123456],
    ["1,234.56 GBP", ".", 123456],
    ["(1,234.56)", ".", -123456],
    ["1,234.56-", ".", -123456],
    ["-$1,234.56", ".", -123456],
    ["1,234.56 CR", ".", -123456],
    ["1234.56CR", ".", -123456],
    ["−99.10", ".", -9910],
    ["1,234", ".", 123400],
    ["12,5", ".", 1250],
    ["1'234.50", ".", 123450],
    ["1234.565", ".", 123457],
    ["1.2E+05", ".", 12000000],
    ["", ".", null],
    ["abc", ".", null],
    ["12/03/2025", ".", null],
  ];
  it.each(cases)("%s (%s)", (raw, dec, expected) => {
    expect(parseAmountCents(raw, dec)).toBe(expected);
  });

  it("detects decimal comma columns", () => {
    expect(detectDecimalSeparator(["1.234,56", "99,00", "12,50"])).toBe(",");
    expect(detectDecimalSeparator(["1,234.56", "99.00", "12.50"])).toBe(".");
  });
});

describe("date parsing", () => {
  it("parses common formats", () => {
    const iso = (s: string, o: "DMY" | "MDY" | "YMD" = "DMY") => daysToIso(parseDateDays(s, o));
    expect(iso("2025-01-12")).toBe("2025-01-12");
    expect(iso("20250112")).toBe("2025-01-12");
    expect(iso("12/01/2025", "DMY")).toBe("2025-01-12");
    expect(iso("01/12/2025", "MDY")).toBe("2025-01-12");
    expect(iso("12.01.25", "DMY")).toBe("2025-01-12");
    expect(iso("12-Jan-2025")).toBe("2025-01-12");
    expect(iso("Jan 12, 2025")).toBe("2025-01-12");
    expect(iso("12 January 2025")).toBe("2025-01-12");
    expect(iso("45669")).toBe("2025-01-12");
    expect(iso("31/02/2025")).toBe(null);
    expect(iso("13/01/2025", "MDY")).toBe(null); // impossible in the file's order: never guessed
    expect(iso("Fri 15 Mar 2024")).toBe("2024-03-15");
    expect(iso("15. März 2024")).toBe("2024-03-15");
    expect(iso("15 janvier 2024")).toBe("2024-01-15");
  });
  it("detects day/month order", () => {
    expect(detectDateOrder(["03/04/2025", "25/04/2025"], "MDY")).toEqual({ order: "DMY", ambiguous: false });
    expect(detectDateOrder(["03/04/2025", "04/25/2025"], "DMY")).toEqual({ order: "MDY", ambiguous: false });
    expect(detectDateOrder(["03/04/2025"], "MDY")).toEqual({ order: "MDY", ambiguous: true });
  });
});

describe("invoice normalisation", () => {
  it("builds strict, loose and digit keys", () => {
    expect(invoiceKeys("INV-00123")).toMatchObject({ strict: "INV00123", loose: "123", digits: "" });
    expect(invoiceKeys("TCS41023")).toMatchObject({ digits: "41023", prefix: "TCS" });
    expect(invoiceKeys("RENT-JAN-2025").digits).toBe("");
    expect(invoiceKeys("RENT").loose).toBe("");
    expect(invoiceKeys("inv 00123").loose).toBe("123");
    expect(invoiceKeys("#123").loose).toBe("123");
    expect(invoiceKeys("INV-O12345").loose).toBe(invoiceKeys("INV-012345").loose);
    expect(invoiceKeys("1O23").loose).toBe("1023");
    expect(invoiceKeys("NW-025-1042").digits).toBe(invoiceKeys("NW-25-1042").digits);
    expect(invoiceKeys("N/A").loose).toBe("");
    expect(invoiceKeys("0000").strict).toBe("");
    expect(invoiceKeys("NOVA-7").loose).toBe("NOVA7");
  });
  it("classifies edits", () => {
    expect(oneEdit("48213", "48231")).toBe("transpose");
    expect(oneEdit("48213", "48214")).toBe("substitute");
    expect(oneEdit("48213", "4823")).toBe("insert");
    expect(oneEdit("48213", "84231")).toBe(null);
  });
  it("relates amounts", () => {
    expect(amountRelation(123450, 124350)).toBe("digits transposed");
    expect(amountRelation(12345, 123450)).toMatch(/decimal point shifted/);
    expect(amountRelation(100000, 120000)).toBe("differs by 20% tax (gross vs net)");
    expect(amountRelation(100000, 100001)).toBe("near-identical amount");
    expect(amountRelation(100000, 130000)).toBe(null);
  });
  it("normalises vendors", () => {
    expect(normalizeVendor("Northwind Traders Ltd.")).toBe(normalizeVendor("NORTHWIND TRADERS LIMITED"));
    expect(normalizeVendor("Acme, L.L.C.")).toBe("ACME");
    expect(vendorSimilarity("TAILSPIN COURIER SERVICES", "TAILSPIN COURIER SERVICE")).toBeGreaterThan(0.95);
    expect(vendorSimilarity("ACME", "GLOBEX")).toBeLessThan(0.6);
  });
});

describe("column mapping", () => {
  it("maps QuickBooks-style headers", () => {
    const headers = ["Date", "Transaction Type", "Num", "Vendor", "Memo/Description", "Amount"];
    const rows = [["01/05/2025", "Bill", "1042", "Acme Inc", "Parts", "1,200.00"]];
    const m = autoMap(headers, rows);
    expect(m.amount).toBe(5);
    expect(m.vendorName).toBe(3);
    expect(m.invoiceDate).toBe(0);
    expect(m.docType).toBe(1);
  });
  it("maps SAP-style headers", () => {
    const headers = ["Vendor", "Name 1", "Reference", "Document Number", "Document Date", "Clearing Date", "Amount in DC", "Crcy"];
    const rows = [["100023", "ACME GMBH", "RE-2025-77", "5100000123", "12.03.2025", "28.03.2025", "-1.234,56", "EUR"]];
    const m = autoMap(headers, rows);
    expect(m.vendorName).toBe(1);
    expect(m.invoiceNumber).toBe(2);
    expect(m.docId).toBe(3);
    expect(m.invoiceDate).toBe(4);
    expect(m.paymentDate).toBe(5);
    expect(m.amount).toBe(6);
    expect(m.currency).toBe(7);
  });
  it("finds the header below report titles", () => {
    const grid = [["Vendor Payment Report"], ["Period: 2025"], [], ["Vendor", "Invoice No", "Invoice Date", "Amount"], ["Acme", "1", "01/01/2025", "10.00"]];
    expect(detectHeaderRow(grid)).toBe(3);
  });
});

// ---------------------------------------------------------------------------

function planted(rows: SampleRow[]) {
  const byGroup = new Map<number, { kind: string; lines: number[] }>();
  rows.forEach((r, i) => {
    if (!r.plant) return;
    const g = byGroup.get(r.plant.group) || { kind: r.plant.kind, lines: [] };
    if (!r.plant.kind.endsWith("_CREDIT")) g.lines.push(i + 2);
    byGroup.set(r.plant.group, g);
  });
  return [...byGroup.values()];
}

function scanGrid(grid: string[][]): ScanResult {
  const table = gridToTable(grid);
  return runScan(table, autoMap(table.headers, table.rows), DEFAULT_SETTINGS);
}

const ACCEPT: Record<string, string[]> = {
  EXACT: ["EXACT"],
  INV_FORMAT: ["INV_FORMAT", "EXACT"],
  INV_TYPO: ["INV_TYPO"],
  CROSS_VENDOR: ["CROSS_VENDOR"],
  AMOUNT_VARIANT: ["AMOUNT_VARIANT"],
  SAME_DAY: ["SAME_DAY", "INV_TYPO"],
  NEAR_DATE: ["NEAR_DATE"],
  SIMILAR_VENDOR: ["SIMILAR_VENDOR"],
  REVERSED: ["EXACT"],
};

function expectPlantedFound(result: ScanResult, rows: SampleRow[]) {
  for (const g of planted(rows)) {
    const f = result.findings.find((x) => g.lines.every((l) => x.rows.some((r) => r.line === l)));
    expect(f, `planted ${g.kind} at lines ${g.lines}`).toBeTruthy();
    expect(ACCEPT[g.kind]).toContain(f!.test);
    if (g.kind === "REVERSED") expect(f!.reversed).toBe(true);
    else expect(f!.reversed).toBe(false);
  }
}

describe("scan of the synthetic AP export", () => {
  const rows = generateSample();
  const grid = sampleToGrid(rows);
  const result = scanGrid(grid);

  it("finds every planted duplicate with the right test", () => {
    expectPlantedFound(result, rows);
  });

  it("does not raise high or medium findings on clean data", () => {
    const plantedLines = new Set(planted(rows).flatMap((g) => g.lines));
    const strays = result.findings.filter((f) => !f.rows.some((r) => plantedLines.has(r.line)));
    for (const f of strays) expect(f.confidence).toBe("low");
  });

  it("ignores monthly and weekly recurring charges", () => {
    const recurring = ["Adatum Cloud Hosting", "Woodgrove Commercial Cleaning", "Alpine Ridge Property Holdings", "Humongous Insurance"];
    for (const f of result.findings) expect(recurring).not.toContain(f.vendor);
  });

  it("survives an XLSX round trip", () => {
    const sheet = {
      name: "AP",
      columns: grid[0].map((h) => ({ header: h })),
      rows: grid.slice(1),
    };
    const bytes = buildXlsx([sheet]);
    const read = readFileBytes("export.xlsx", bytes);
    expect(read.format).toBe("xlsx");
    const again = scanGrid(read.sheets[0].grid);
    expect(again.findings.length).toBe(result.findings.length);
    expect(again.stats.currencies[0].exposureCents).toBe(result.stats.currencies[0].exposureCents);
  });

  it("handles European CSV (semicolons, decimal commas, day-first dates)", () => {
    const eu = grid.map((r, i) =>
      i === 0
        ? r
        : r.map((c, j) => {
            if (j === 4 || j === 5) return c ? c.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$2.$1.$3") : c; // DD.MM.YYYY
            if (j === 6) return c.replace(/,/g, " ").replace(".", ",");
            return c;
          }),
    );
    const csv = eu.map((r) => r.map((c) => (/[;"]/.test(c) ? `"${c}"` : c)).join(";")).join("\n");
    const read = readFileBytes("eu.csv", new TextEncoder().encode(csv));
    const again = scanGrid(read.sheets[0].grid);
    expect(again.detected.dateOrder).toBe("DMY");
    expect(again.detected.decimalSeparator).toBe(",");
    expectPlantedFound(again, rows);
  });

  it("handles ERP ledgers where invoices are negative", () => {
    const flipped = grid.map((r, i) => (i === 0 ? r.filter((_, j) => j !== 2) : r.filter((_, j) => j !== 2).map((c, j) => (j === 5 ? (c.startsWith("-") ? c.slice(1) : `-${c}`) : c))));
    const again = scanGrid(flipped);
    expect(again.warnings.join(" ")).toMatch(/negative amounts were treated as invoices/);
    const exact = again.findings.filter((f) => f.test === "EXACT" && !f.reversed);
    expect(exact.length).toBeGreaterThanOrEqual(6);
  });

  it("CSV export neutralises formula injection", () => {
    expect(toCsv([["=HYPERLINK(1)", "-12.5", "+SUM(A1)"]])).toBe("'=HYPERLINK(1),-12.5,'+SUM(A1)");
  });
});

describe("performance", () => {
  it("scans 150,000 rows in a few seconds", () => {
    const base = generateSample(7);
    const grid: string[][] = [sampleToGrid(base)[0]];
    let seed = 7;
    while (grid.length < 150_000) {
      const g = sampleToGrid(generateSample(++seed)).slice(1);
      // Make vendors distinct per batch so the file looks like a big company.
      for (const r of g) {
        r[0] = `${r[0]}-${seed}`;
        r[1] = `${CITIES[seed % CITIES.length]} ${CITIES[Math.floor(seed / CITIES.length) % CITIES.length]} ${r[1]}`;
        grid.push(r);
      }
    }
    const t0 = Date.now();
    const res = scanGrid(grid);
    const ms = Date.now() - t0;
    expect(res.stats.rowsUsed).toBeGreaterThan(145_000);
    expect(ms).toBeLessThan(15_000);
  }, 60_000);
});

describe("delimited parsing", () => {
  it("parses tab separated text", () => {
    expect(parseDelimited("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});
