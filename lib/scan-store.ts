"use client";

// One scan session per tab, kept in module scope so it survives client-side navigation
// (for example going to sign up and back). Nothing here is persisted or sent anywhere.

import { useSyncExternalStore } from "react";
import type { LoadedInfo, WorkerIn, WorkerOut } from "./engine/worker";
import { DEFAULT_SETTINGS, type ColumnMapping, type ScanResult, type ScanSettings } from "./engine/types";

export type Phase = "idle" | "reading" | "mapping" | "scanning" | "results";

export interface ScanState {
  phase: Phase;
  stage: string;
  error: string | null;
  info: LoadedInfo | null;
  mapping: ColumnMapping;
  settings: ScanSettings;
  result: ScanResult | null;
  /** Mapping and settings the current result was produced with. */
  resultFor: { fileName: string; at: string } | null;
  isSample: boolean;
  savedAuditId: string | null;
}

export const SAMPLE_FILE = "/sample/northwind-ap-export-2025.csv";
export const SAMPLE_NAME = "northwind-ap-export-2025.csv";

function initial(): ScanState {
  return {
    phase: "idle",
    stage: "",
    error: null,
    info: null,
    mapping: {},
    settings: { ...DEFAULT_SETTINGS, tests: { ...DEFAULT_SETTINGS.tests } },
    result: null,
    resultFor: null,
    isSample: false,
    savedAuditId: null,
  };
}

const SERVER_STATE = initial();
let state: ScanState = initial();
const subscribers = new Set<() => void>();

function set(patch: Partial<ScanState>) {
  state = { ...state, ...patch };
  subscribers.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function getScanState(): ScanState {
  return state;
}

export function useScan(): ScanState {
  return useSyncExternalStore(subscribe, getScanState, () => SERVER_STATE);
}

let worker: Worker | null = null;

function post(msg: WorkerIn, transfer: Transferable[] = []) {
  getWorker().postMessage(msg, transfer);
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./engine/worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<WorkerOut>) => handle(ev.data);
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      set({
        phase: state.info ? "mapping" : "idle",
        error: "The scanner stopped unexpectedly. Reload the page and try again, or save the file as CSV first.",
      });
    };
  }
  return worker;
}

function handle(msg: WorkerOut) {
  switch (msg.type) {
    case "progress":
      set({ stage: msg.stage });
      break;
    case "loaded":
      set({ phase: "mapping", info: msg, mapping: msg.mapping, error: null, result: null, savedAuditId: null });
      break;
    case "result":
      set({
        phase: "results",
        result: msg.result,
        resultFor: { fileName: state.info?.fileName ?? "", at: new Date().toISOString() },
        error: null,
        savedAuditId: null,
      });
      break;
    case "error":
      set({ phase: state.info ? "mapping" : "idle", error: msg.message });
      break;
  }
}

/**
 * Starts the scanner thread as soon as the scan page opens, so its code is already loaded and a
 * scan keeps working even if the connection drops afterwards.
 */
export function prewarmScanner() {
  if (typeof window === "undefined" || typeof Worker === "undefined") return;
  try {
    getWorker();
  } catch {
    /* created on demand instead */
  }
}

const MAX_BYTES = 80 * 1024 * 1024;

export async function loadFile(file: File): Promise<void> {
  if (file.size > MAX_BYTES) {
    set({ phase: "idle", error: "That file is over 80 MB. Split it by year or entity and scan each part." });
    return;
  }
  set({ ...initial(), phase: "reading", stage: "Reading file" });
  try {
    const buffer = await file.arrayBuffer();
    post({ type: "load", name: file.name, buffer }, [buffer]);
  } catch {
    set({ phase: "idle", error: "That file could not be read. Check it is not open in another program and try again." });
  }
}

export async function loadSample(): Promise<void> {
  set({ ...initial(), phase: "reading", stage: "Loading the sample file", isSample: true });
  try {
    const res = await fetch(SAMPLE_FILE);
    if (!res.ok) throw new Error(String(res.status));
    const buffer = await res.arrayBuffer();
    post({ type: "load", name: SAMPLE_NAME, buffer }, [buffer]);
  } catch {
    set({ phase: "idle", error: "The sample file could not be loaded. Check your connection and try again." });
  }
}

export function chooseSheet(index: number, headerRow?: number) {
  set({ error: null });
  post({ type: "sheet", index, headerRow });
}

export function setMapping(mapping: ColumnMapping) {
  set({ mapping });
}

export function setSettings(settings: ScanSettings) {
  set({ settings });
}

export function startScan() {
  set({ phase: "scanning", stage: "Scanning", error: null });
  post({ type: "scan", mapping: state.mapping, settings: state.settings });
}

export function backToMapping() {
  set({ phase: "mapping", error: null });
}

export function resetScan() {
  worker?.terminate();
  worker = null;
  set(initial());
  prewarmScanner();
}

export function markSaved(id: string) {
  set({ savedAuditId: id });
}

export function clearError() {
  set({ error: null });
}
