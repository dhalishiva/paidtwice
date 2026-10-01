// File readers that work inside a Web Worker (no DOM): CSV/TSV/TXT, XLSX and
// HTML-table "xls" files that many ERPs (SAP, older web apps) produce.

import Papa from "papaparse";
import { strFromU8, unzipSync } from "fflate";
import { detectHeaderRow } from "./mapping";
import type { RawTable } from "./types";

export interface SheetGrid {
  name: string;
  grid: string[][];
}

export class FileReadError extends Error {}

const MAX_BYTES = 80 * 1024 * 1024;

export function decodeText(buf: Uint8Array): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  const body = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    // Mostly UTF-8 with a stray byte, or a legacy Windows export.
    return new TextDecoder("windows-1252").decode(body);
  }
}

function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);/g, (_, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[e] ?? "";
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1]] = decodeEntities(m[2] ?? m[3] ?? "");
  return out;
}

// ---------------------------------------------------------------------------
// CSV / TSV

export function parseDelimited(text: string): string[][] {
  const res = Papa.parse<string[]>(text, { skipEmptyLines: false, delimitersToGuess: [",", "\t", ";", "|"] });
  return (res.data || []).map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c))) : []));
}

// ---------------------------------------------------------------------------
// HTML tables saved with an .xls extension

export function parseHtmlTable(html: string): string[][] {
  const rows: string[][] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const cells: string[] = [];
    const cellRe = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(m[1]))) {
      const text = decodeEntities(c[2].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      cells.push(text);
      const span = Number(attrs(c[1]).colspan || 1);
      for (let k = 1; k < span && k < 50; k++) cells.push("");
    }
    rows.push(cells);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// XLSX (Office Open XML)

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormatCode(code: string): boolean {
  const cleaned = code
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\\./g, "")
    .replace(/_./g, "");
  return /[dmyhs]/i.test(cleaned) && !/^[#0.,%E+\-\s]*$/i.test(cleaned);
}

function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function serialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const iso = d.toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
}

function textOfSi(si: string): string {
  // Drop phonetic runs, then join every <t> text node.
  const body = si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out += m[1];
  return decodeEntities(out);
}

export function readXlsx(buf: Uint8Array): SheetGrid[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf, {
      filter: (f) =>
        f.name === "xl/workbook.xml" ||
        f.name === "xl/_rels/workbook.xml.rels" ||
        f.name === "xl/sharedStrings.xml" ||
        f.name === "xl/styles.xml" ||
        f.name.startsWith("xl/worksheets/sheet"),
    });
  } catch {
    throw new FileReadError("This Excel file could not be opened. It may be password-protected or damaged.");
  }
  const workbook = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  if (!workbook) throw new FileReadError("This does not look like an Excel workbook.");

  const rels = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const relTargets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.Id && a.Target) {
      let t = a.Target.replace(/^\//, "");
      if (!t.startsWith("xl/")) t = `xl/${t}`;
      relTargets.set(a.Id, t);
    }
  }

  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) {
    const sst = strFromU8(files["xl/sharedStrings.xml"]);
    for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) shared.push(m[1] ? textOfSi(m[1]) : "");
  }

  const dateStyles = new Set<number>();
  if (files["xl/styles.xml"]) {
    const styles = strFromU8(files["xl/styles.xml"]);
    const custom = new Map<number, string>();
    for (const m of styles.matchAll(/<numFmt\b[^>]*\/?>/g)) {
      const a = attrs(m[0]);
      custom.set(Number(a.numFmtId), a.formatCode || "");
    }
    const xfs = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
    if (xfs) {
      let i = 0;
      for (const m of xfs[1].matchAll(/<xf\b[^>]*?(?:\/>|>)/g)) {
        const id = Number(attrs(m[0]).numFmtId || 0);
        if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormatCode(custom.get(id)!))) dateStyles.add(i);
        i++;
      }
    }
  }

  const sheets: SheetGrid[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const a = attrs(m[0]);
    const rid = Object.entries(a).find(([k]) => k.endsWith(":id") || k === "id")?.[1];
    const path = (rid && relTargets.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const data = files[path];
    if (!data) continue;
    if (a.state === "hidden" || a.state === "veryHidden") continue;
    sheets.push({ name: a.name || `Sheet ${sheets.length + 1}`, grid: readSheet(strFromU8(data), shared, dateStyles) });
  }
  if (!sheets.length) throw new FileReadError("The workbook has no readable sheets.");
  return sheets;
}

function readSheet(xml: string, shared: string[], dateStyles: Set<number>): string[][] {
  const grid: string[][] = [];
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm: RegExpExecArray | null;
  let nextRow = 1;
  while ((rm = rowRe.exec(xml))) {
    const ra = attrs(rm[1]);
    const rnum = ra.r ? Number(ra.r) : nextRow;
    // Fill gaps so array index + 1 == Excel row number (bounded to avoid giant sparse sheets).
    while (grid.length < rnum - 1 && grid.length - (nextRow - 1) < 5000) grid.push([]);
    nextRow = rnum + 1;
    const cells: string[] = [];
    if (rm[2]) {
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm: RegExpExecArray | null;
      let nextCol = 0;
      while ((cm = cellRe.exec(rm[2]))) {
        const ca = attrs(cm[1]);
        const col = ca.r ? colIndex(ca.r.replace(/\d+$/, "")) : nextCol;
        nextCol = col + 1;
        const inner = cm[2] || "";
        const v = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        let value = "";
        switch (ca.t) {
          case "s":
            value = v !== undefined ? (shared[Number(v)] ?? "") : "";
            break;
          case "inlineStr":
            value = textOfSi(inner);
            break;
          case "str":
            value = v !== undefined ? decodeEntities(v) : "";
            break;
          case "b":
            value = v === "1" ? "TRUE" : "FALSE";
            break;
          case "e":
            value = "";
            break;
          case "d":
            value = v !== undefined ? v.slice(0, 10) : "";
            break;
          default:
            if (v !== undefined && v !== "") {
              const num = Number(v);
              value = ca.s !== undefined && dateStyles.has(Number(ca.s)) && Number.isFinite(num) ? serialToIso(num) : v;
            }
        }
        if (col >= 0 && col < 2000) {
          while (cells.length < col) cells.push("");
          cells[col] = value.trim();
        }
      }
    }
    grid.push(cells);
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Entry point

export interface ReadResult {
  sheets: SheetGrid[];
  format: "csv" | "xlsx" | "html";
}

export function readFileBytes(name: string, buf: Uint8Array): ReadResult {
  if (buf.byteLength > MAX_BYTES) throw new FileReadError("That file is over 80 MB. Split it by year or entity and scan each part.");
  const lower = name.toLowerCase();
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  const isOle = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
  if (isOle) {
    throw new FileReadError(
      "This is an old Excel 97-2003 (.xls) workbook. Open it in Excel and use File > Save As > Excel Workbook (.xlsx) or CSV, then scan that file.",
    );
  }
  if (isZip) {
    if (lower.endsWith(".numbers")) throw new FileReadError("Apple Numbers files are not supported. Export to CSV or Excel first.");
    return { sheets: readXlsx(buf), format: "xlsx" };
  }
  const text = decodeText(buf);
  const head = text.slice(0, 2000).toLowerCase();
  if (head.includes("<table") || head.includes("<html")) {
    return { sheets: [{ name: name.replace(/\.[^.]+$/, ""), grid: parseHtmlTable(text) }], format: "html" };
  }
  return { sheets: [{ name: name.replace(/\.[^.]+$/, ""), grid: parseDelimited(text) }], format: "csv" };
}

/** Turn a grid into a header + rows table, detecting the header row automatically. */
export function gridToTable(grid: string[][], sheetName?: string, headerIndex?: number): RawTable {
  const h = headerIndex ?? detectHeaderRow(grid);
  const headerCells = (grid[h] || []).map((c) => String(c ?? "").trim());
  // Width = widest of the first rows, so trailing unnamed columns are kept.
  let width = headerCells.length;
  for (let i = h + 1; i < Math.min(grid.length, h + 200); i++) width = Math.max(width, grid[i]?.length || 0);
  const headers = Array.from({ length: width }, (_, i) => headerCells[i] || `Column ${i + 1}`);
  const rows = grid.slice(h + 1);
  // Drop trailing empty rows.
  let end = rows.length;
  while (end > 0 && (!rows[end - 1] || rows[end - 1].every((c) => !String(c ?? "").trim()))) end--;
  return { headers, rows: rows.slice(0, end), headerLine: h + 1, sheetName };
}

/** Pick the sheet that most looks like a transaction list. */
export function bestSheet(sheets: SheetGrid[]): number {
  let best = 0;
  let bestRows = -1;
  sheets.forEach((s, i) => {
    const filled = s.grid.filter((r) => r.filter((c) => String(c ?? "").trim()).length >= 3).length;
    if (filled > bestRows) {
      bestRows = filled;
      best = i;
    }
  });
  return best;
}
