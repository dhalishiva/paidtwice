"use client";

import { buildXlsx, toCsv, type SheetSpec } from "./engine/xlsx-writer";
import { TEST_BY_CODE, TESTS, type Finding, type FindingRow, type ScanStats } from "./engine/types";

export interface ExportFinding extends Pick<Finding, "id" | "test" | "confidence" | "score" | "vendor" | "currency" | "amountCents" | "exposureCents" | "reasons" | "reversed" | "alsoMatched"> {
  rows: FindingRow[];
  offsets: FindingRow[];
  status?: string;
  recoveredCents?: number | null;
  note?: string | null;
}

export interface ExportMeta {
  title: string;
  fileName: string;
  scannedAt: string;
  stats?: ScanStats;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  confirmed: "Confirmed duplicate",
  not_duplicate: "Not a duplicate",
  recovered: "Recovered",
};

const CONF_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

function slug(s: string): string {
  return (
    s
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 60) || "scan"
  );
}

function download(data: string | Uint8Array<ArrayBuffer>, type: string, name: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const major = (cents: number | null | undefined) => (cents == null ? null : Math.round(cents) / 100);

export function exportExcel(findings: ExportFinding[], meta: ExportMeta) {
  const tracked = findings.some((f) => f.status);
  const findingCols: SheetSpec["columns"] = [
    { header: "#", width: 6, type: "number" },
    { header: "Confidence", width: 12 },
    { header: "Check", width: 34 },
    { header: "Vendor", width: 32 },
    { header: "Currency", width: 10 },
    { header: "Amount", width: 14, type: "money" },
    { header: "At stake", width: 14, type: "money" },
    { header: "Lines in file", width: 16 },
    { header: "Invoice numbers", width: 26 },
    { header: "Reason", width: 70 },
    { header: "Already reversed", width: 16 },
  ];
  if (tracked) {
    findingCols.push({ header: "Status", width: 20 }, { header: "Recovered", width: 14, type: "money" }, { header: "Note", width: 40 });
  }
  const findingRows = findings.map((f, i) => {
    const row: (string | number | null)[] = [
      i + 1,
      CONF_LABEL[f.confidence],
      TEST_BY_CODE[f.test]?.name ?? f.test,
      f.vendor,
      f.currency,
      major(f.amountCents),
      major(f.exposureCents),
      f.rows.map((r) => r.line).join(", "),
      [...new Set(f.rows.map((r) => r.invoiceNumber).filter(Boolean))].join(" / "),
      f.reasons.join(" "),
      f.reversed ? "Yes" : "",
    ];
    if (tracked) row.push(STATUS_LABEL[f.status ?? "open"] ?? f.status ?? "", major(f.recoveredCents), f.note ?? "");
    return row;
  });

  const lineRows: (string | number | null)[][] = [];
  findings.forEach((f, i) => {
    const push = (r: FindingRow, role: string) =>
      lineRows.push([
        i + 1,
        role,
        r.line,
        r.vendorName,
        r.vendorId,
        r.invoiceNumber,
        r.invoiceDate,
        r.paymentDate,
        major(r.amountCents),
        r.docId,
        r.description,
      ]);
    f.rows.forEach((r) => push(r, "Possible duplicate"));
    f.offsets.forEach((r) => push(r, "Credit that offsets it"));
  });

  const summary: (string | number | null)[][] = [
    ["Report", meta.title],
    ["Source file", meta.fileName],
    ["Scanned", meta.scannedAt.slice(0, 10)],
  ];
  if (meta.stats) {
    const s = meta.stats;
    summary.push(
      ["Lines in file", s.rowsTotal],
      ["Lines checked", s.rowsUsed],
      ["Period", s.dateMin && s.dateMax ? `${s.dateMin} to ${s.dateMax}` : ""],
      ["Vendors", s.vendors],
      ["Possible duplicates", s.findings],
      ["Already reversed by a credit", s.reversedFindings],
    );
    for (const c of s.currencies) {
      summary.push([
        `At stake (${c.currency})`,
        (c.exposureCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ]);
    }
    summary.push(["", ""], ["Check", "Findings"]);
    for (const t of TESTS) summary.push([t.name, s.byTest[t.code]?.count ?? 0]);
  }
  summary.push(
    ["", ""],
    ["Note", "These are possible duplicates. Check each one against the source documents and your bank statement before contacting a vendor."],
  );

  const bytes = buildXlsx([
    { name: "Findings", columns: findingCols, rows: findingRows },
    {
      name: "Lines",
      columns: [
        { header: "Finding #", width: 10, type: "number" },
        { header: "Role", width: 22 },
        { header: "Line in file", width: 12, type: "number" },
        { header: "Vendor", width: 32 },
        { header: "Vendor ID", width: 14 },
        { header: "Invoice number", width: 20 },
        { header: "Invoice date", width: 13 },
        { header: "Payment date", width: 13 },
        { header: "Amount", width: 14, type: "money" },
        { header: "Document ID", width: 18 },
        { header: "Description", width: 40 },
      ],
      rows: lineRows,
    },
    { name: "Summary", columns: [{ header: "Item", width: 34 }, { header: "Value", width: 60 }], rows: summary },
  ]);
  download(new Uint8Array(bytes), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `paidtwice-${slug(meta.fileName || meta.title)}.xlsx`);
}

export function exportCsv(findings: ExportFinding[], meta: ExportMeta) {
  const rows: (string | number | null)[][] = [
    ["Finding #", "Confidence", "Check", "Role", "Line in file", "Vendor", "Vendor ID", "Invoice number", "Invoice date", "Payment date", "Currency", "Amount", "At stake (finding)", "Reason"],
  ];
  findings.forEach((f, i) => {
    const add = (r: FindingRow, role: string) =>
      rows.push([
        i + 1,
        CONF_LABEL[f.confidence],
        TEST_BY_CODE[f.test]?.name ?? f.test,
        role,
        r.line,
        r.vendorName,
        r.vendorId,
        r.invoiceNumber,
        r.invoiceDate,
        r.paymentDate,
        f.currency,
        major(r.amountCents),
        major(f.exposureCents),
        f.reasons[0] ?? "",
      ]);
    f.rows.forEach((r) => add(r, "Possible duplicate"));
    f.offsets.forEach((r) => add(r, "Credit that offsets it"));
  });
  download("﻿" + toCsv(rows), "text/csv;charset=utf-8", `paidtwice-${slug(meta.fileName || meta.title)}.csv`);
}
