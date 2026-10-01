/// <reference lib="webworker" />
// Runs file parsing and the scan off the main thread. Nothing here talks to the network:
// the file the user picks is read, analysed and discarded inside their own browser.

import { bestSheet, FileReadError, gridToTable, readFileBytes, type SheetGrid } from "./readers";
import { autoMap } from "./mapping";
import { runScan } from "./detect";
import type { ColumnMapping, RawTable, ScanSettings } from "./types";

export type WorkerIn =
  | { type: "load"; name: string; buffer: ArrayBuffer }
  | { type: "sheet"; index: number; headerRow?: number }
  | { type: "scan"; mapping: ColumnMapping; settings: ScanSettings };

export interface LoadedInfo {
  type: "loaded";
  fileName: string;
  format: string;
  sheets: { name: string; rows: number }[];
  sheetIndex: number;
  headers: string[];
  preview: string[][];
  rowCount: number;
  headerLine: number;
  mapping: ColumnMapping;
}

export type WorkerOut =
  | LoadedInfo
  | { type: "progress"; stage: string }
  | { type: "result"; result: import("./types").ScanResult }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let sheets: SheetGrid[] = [];
let table: RawTable | null = null;
let fileName = "";
let format = "";
let sheetIndex = 0;

function post(msg: WorkerOut) {
  ctx.postMessage(msg);
}

function describe(): LoadedInfo {
  const t = table!;
  return {
    type: "loaded",
    fileName,
    format,
    sheets: sheets.map((s) => ({ name: s.name, rows: s.grid.length })),
    sheetIndex,
    headers: t.headers,
    preview: t.rows.slice(0, 6),
    rowCount: t.rows.length,
    headerLine: t.headerLine,
    mapping: autoMap(t.headers, t.rows),
  };
}

ctx.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  try {
    if (msg.type === "load") {
      post({ type: "progress", stage: "Reading file" });
      const res = readFileBytes(msg.name, new Uint8Array(msg.buffer));
      sheets = res.sheets;
      format = res.format;
      fileName = msg.name;
      sheetIndex = bestSheet(sheets);
      table = gridToTable(sheets[sheetIndex].grid, sheets[sheetIndex].name);
      if (!table.rows.length) throw new FileReadError("No data rows were found in this file.");
      post(describe());
    } else if (msg.type === "sheet") {
      if (!sheets.length) throw new FileReadError("Load a file first.");
      sheetIndex = Math.max(0, Math.min(sheets.length - 1, msg.index));
      const grid = sheets[sheetIndex].grid;
      table = gridToTable(grid, sheets[sheetIndex].name, msg.headerRow !== undefined ? msg.headerRow - 1 : undefined);
      post(describe());
    } else if (msg.type === "scan") {
      if (!table) throw new FileReadError("Load a file first.");
      post({ type: "progress", stage: "Scanning" });
      const result = runScan(table, msg.mapping, msg.settings);
      post({ type: "result", result });
    }
  } catch (err) {
    const message =
      err instanceof FileReadError
        ? err.message
        : `Something went wrong while reading this file (${err instanceof Error ? err.message : String(err)}). Try exporting it as CSV.`;
    post({ type: "error", message });
  }
};
