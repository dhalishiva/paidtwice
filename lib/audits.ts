"use client";

import { getSupabase } from "./supabase";
import type { Confidence, FindingRow, ScanResult, TestCode } from "./engine/types";
import type { ExportFinding } from "./export";

export type FindingStatus = "open" | "confirmed" | "not_duplicate" | "recovered";

export const STATUS_OPTIONS: { value: FindingStatus; label: string }[] = [
  { value: "open", label: "To review" },
  { value: "confirmed", label: "Confirmed duplicate" },
  { value: "not_duplicate", label: "Not a duplicate" },
  { value: "recovered", label: "Recovered" },
];

export interface AuditRow {
  id: string;
  name: string;
  file_name: string | null;
  rows_scanned: number;
  currency: string | null;
  scanned_cents: number | null;
  exposure_cents: number | null;
  high_exposure_cents: number | null;
  finding_count: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

export interface AuditSummary {
  audit_id: string;
  confirmed_count: number;
  recovered_count: number;
  dismissed_count: number;
  recovered_cents: number;
  confirmed_cents: number;
}

export interface SavedFinding extends ExportFinding {
  dbId: string;
  status: FindingStatus;
  recoveredCents: number | null;
  note: string | null;
}

const MAX_ROWS_PER_FINDING = 60;

function client() {
  const sb = getSupabase();
  if (!sb) throw new Error("Saving is not available right now.");
  return sb;
}

/** Stores the findings of a scan (never the file) and returns the new audit id. */
export async function saveAudit(result: ScanResult, fileName: string, name: string): Promise<string> {
  const sb = client();
  const s = result.stats;
  const primary = s.currencies[0];
  const { data: audit, error } = await sb
    .from("audits")
    .insert({
      name: name.slice(0, 200) || "Untitled audit",
      file_name: fileName.slice(0, 300),
      rows_scanned: s.rowsUsed,
      currency: (primary?.currency ?? s.primaryCurrency ?? "").slice(0, 3) || null,
      scanned_cents: primary?.scannedCents ?? null,
      exposure_cents: primary?.exposureCents ?? 0,
      high_exposure_cents: primary?.highExposureCents ?? 0,
      finding_count: s.findings,
      period_start: s.dateMin,
      period_end: s.dateMax,
      stats: {
        rowsTotal: s.rowsTotal,
        rowsUsed: s.rowsUsed,
        rowsSkipped: s.rowsSkipped,
        vendors: s.vendors,
        credits: s.credits,
        findings: s.findings,
        reversedFindings: s.reversedFindings,
        currencies: s.currencies.slice(0, 20),
        byTest: s.byTest,
        byConfidence: s.byConfidence,
      },
      settings: {
        nearDateWindowDays: result.settings.nearDateWindowDays,
        minAmount: result.settings.minAmount,
        tests: result.settings.tests,
        detected: result.detected,
      },
    })
    .select("id")
    .single();
  if (error || !audit) {
    if (error?.code === "42501" || /row-level security/i.test(error?.message ?? "")) {
      throw new Error("Saving audits needs an Audit Pass or Pro plan.");
    }
    throw new Error(error?.message ?? "The audit could not be saved.");
  }

  const seen = new Set<string>();
  const rows = result.findings.map((f, i) => {
    let key = f.id;
    if (seen.has(key)) key = `${f.id}-${i}`;
    seen.add(key);
    return {
      audit_id: audit.id,
      finding_key: key.slice(0, 64),
      test: f.test,
      confidence: f.confidence,
      score: f.score,
      vendor: f.vendor.slice(0, 300),
      currency: f.currency.slice(0, 3),
      amount_cents: f.amountCents,
      exposure_cents: f.exposureCents,
      reversed: f.reversed,
      reasons: f.reasons.slice(0, 6),
      rows: { rows: f.rows.slice(0, MAX_ROWS_PER_FINDING), offsets: f.offsets.slice(0, MAX_ROWS_PER_FINDING), alsoMatched: f.alsoMatched },
    };
  });
  for (let i = 0; i < rows.length; i += 250) {
    const { error: e } = await sb.from("findings").insert(rows.slice(i, i + 250));
    if (e) {
      await sb.from("audits").delete().eq("id", audit.id);
      throw new Error(`The findings could not be saved (${e.message}).`);
    }
  }
  return audit.id as string;
}

export async function listAudits(): Promise<{ audits: AuditRow[]; summaries: Map<string, AuditSummary> }> {
  const sb = client();
  const [{ data: audits, error }, { data: sums }] = await Promise.all([
    sb.from("audits").select("id, name, file_name, rows_scanned, currency, scanned_cents, exposure_cents, high_exposure_cents, finding_count, period_start, period_end, created_at").order("created_at", { ascending: false }),
    sb.from("audit_summaries").select("*"),
  ]);
  if (error) throw new Error(error.message);
  const summaries = new Map<string, AuditSummary>();
  for (const s of (sums ?? []) as AuditSummary[]) summaries.set(s.audit_id, s);
  return { audits: (audits ?? []) as AuditRow[], summaries };
}

interface DbFinding {
  id: string;
  finding_key: string;
  test: TestCode;
  confidence: Confidence;
  score: number;
  vendor: string | null;
  currency: string | null;
  amount_cents: number;
  exposure_cents: number;
  reversed: boolean;
  reasons: string[];
  rows: { rows?: FindingRow[]; offsets?: FindingRow[]; alsoMatched?: TestCode[] } | FindingRow[];
  status: FindingStatus;
  recovered_cents: number | null;
  note: string | null;
}

export async function loadAudit(id: string): Promise<{ audit: AuditRow & { stats: Record<string, unknown> }; findings: SavedFinding[] } | null> {
  const sb = client();
  const { data: audit, error } = await sb.from("audits").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!audit) return null;
  const all: DbFinding[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await sb.from("findings").select("*").eq("audit_id", id).range(from, from + 999);
    if (e) throw new Error(e.message);
    all.push(...((data ?? []) as DbFinding[]));
    if (!data || data.length < 1000) break;
  }
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const findings: SavedFinding[] = all
    .map((d) => {
      const packed = Array.isArray(d.rows) ? { rows: d.rows, offsets: [] as FindingRow[], alsoMatched: [] as TestCode[] } : d.rows;
      return {
        dbId: d.id,
        id: d.finding_key,
        test: d.test,
        confidence: d.confidence,
        score: d.score,
        vendor: d.vendor ?? "",
        currency: d.currency ?? "USD",
        amountCents: Number(d.amount_cents),
        exposureCents: Number(d.exposure_cents),
        reasons: d.reasons ?? [],
        reversed: d.reversed,
        alsoMatched: packed.alsoMatched ?? [],
        rows: packed.rows ?? [],
        offsets: packed.offsets ?? [],
        status: d.status,
        recoveredCents: d.recovered_cents == null ? null : Number(d.recovered_cents),
        note: d.note,
      };
    })
    .sort((a, b) => Number(a.reversed) - Number(b.reversed) || rank[a.confidence] - rank[b.confidence] || b.exposureCents - a.exposureCents);
  return { audit: audit as AuditRow & { stats: Record<string, unknown> }, findings };
}

export async function updateFinding(dbId: string, patch: { status?: FindingStatus; recovered_cents?: number | null; note?: string | null }) {
  const sb = client();
  const { error } = await sb.from("findings").update(patch).eq("id", dbId);
  if (error) throw new Error(error.message);
}

export async function renameAudit(id: string, name: string) {
  const sb = client();
  const { error } = await sb.from("audits").update({ name: name.slice(0, 200) }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAudit(id: string) {
  const sb = client();
  const { error } = await sb.from("audits").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
