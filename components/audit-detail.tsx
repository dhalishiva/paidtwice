"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteAudit, loadAudit, renameAudit, STATUS_OPTIONS, updateFinding, type AuditRow, type FindingStatus, type SavedFinding } from "@/lib/audits";
import { exportCsv, exportExcel } from "@/lib/export";
import { count, dateTime, isoDate, money, plural } from "@/lib/format";
import type { ScanStats } from "@/lib/engine/types";
import { RequireAuth } from "./require-auth";
import { FindingCard } from "./scanner/finding-card";
import { CreditEmailButton } from "./scanner/credit-email";

type StatusFilter = "all" | FindingStatus;

function FindingTracker({ f, onChange }: { f: SavedFinding; onChange: (patch: Partial<SavedFinding>) => void }) {
  const [status, setStatus] = useState<FindingStatus>(f.status);
  const [recovered, setRecovered] = useState(f.recoveredCents == null ? "" : (f.recoveredCents / 100).toFixed(2));
  const [note, setNote] = useState(f.note ?? "");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = (patch: { status?: FindingStatus; recovered_cents?: number | null; note?: string | null }) => {
    setSaved("saving");
    updateFinding(f.dbId, patch)
      .then(() => {
        setSaved("saved");
        onChange({
          ...(patch.status ? { status: patch.status } : {}),
          ...("recovered_cents" in patch ? { recoveredCents: patch.recovered_cents ?? null } : {}),
          ...("note" in patch ? { note: patch.note ?? null } : {}),
        });
      })
      .catch(() => setSaved("error"));
  };

  const debounced = (patch: Parameters<typeof persist>[0]) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(patch), 700);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div className="grid w-full gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,11rem)_minmax(0,1fr)] sm:items-start">
      <label className="field">
        <span className="label">Status</span>
        <select
          className="select"
          value={status}
          onChange={(e) => {
            const v = e.target.value as FindingStatus;
            setStatus(v);
            const patch: Parameters<typeof persist>[0] = { status: v };
            if (v === "recovered" && recovered === "") {
              setRecovered((f.exposureCents / 100).toFixed(2));
              patch.recovered_cents = f.exposureCents;
            }
            persist(patch);
          }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Recovered ({f.currency})</span>
        <input
          className="input num"
          inputMode="decimal"
          value={recovered}
          placeholder="0.00"
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.]/g, "");
            setRecovered(raw);
            const cents = raw === "" ? null : Math.round(Number(raw) * 100);
            if (cents === null || Number.isFinite(cents)) debounced({ recovered_cents: cents });
          }}
        />
      </label>
      <label className="field">
        <span className="label">Note</span>
        <input
          className="input"
          value={note}
          maxLength={2000}
          placeholder="Credit note CN-1042 received"
          onChange={(e) => {
            setNote(e.target.value);
            debounced({ note: e.target.value || null });
          }}
        />
      </label>
      <p className="text-sm text-ink-3 sm:col-span-3" aria-live="polite">
        {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : saved === "error" ? <span className="error-text">Not saved. Check your connection.</span> : ""}
      </p>
    </div>
  );
}

function Inner({ id }: { id: string }) {
  const router = useRouter();
  const [audit, setAudit] = useState<(AuditRow & { stats: Record<string, unknown> }) | null>(null);
  const [findings, setFindings] = useState<SavedFinding[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    loadAudit(id)
      .then((res) => {
        if (!res) {
          setState("missing");
          return;
        }
        setAudit(res.audit);
        setName(res.audit.name);
        setFindings(res.findings);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [id]);

  const totals = useMemo(() => {
    const t = { open: 0, confirmed: 0, not_duplicate: 0, recovered: 0, confirmedCents: 0, recoveredCents: 0 };
    for (const f of findings) {
      if (f.reversed) continue;
      t[f.status]++;
      if (f.status === "confirmed" || f.status === "recovered") t.confirmedCents += f.exposureCents;
      if (f.status === "recovered") t.recoveredCents += f.recoveredCents ?? 0;
    }
    return t;
  }, [findings]);

  if (state === "loading") return <p className="wrap py-20 text-ink-2">Loading the audit…</p>;
  if (state === "missing" || state === "error" || !audit) {
    return (
      <div className="wrap py-20">
        <h1 className="h2">{state === "error" ? "This audit could not be loaded" : "Audit not found"}</h1>
        <p className="mt-3 text-ink-2">It may have been deleted, or it belongs to another account.</p>
        <Link href="/app" className="btn btn-quiet mt-6">
          Back to your audits
        </Link>
      </div>
    );
  }

  const cur = audit.currency || "USD";
  const visible = findings.filter((f) => (filter === "all" ? !f.reversed : !f.reversed && f.status === filter));
  const meta = { title: audit.name, fileName: audit.file_name ?? audit.name, scannedAt: audit.created_at, stats: audit.stats as unknown as ScanStats };
  const patchFinding = (dbId: string, patch: Partial<SavedFinding>) =>
    setFindings((all) => all.map((x) => (x.dbId === dbId ? { ...x, ...patch } : x)));

  return (
    <div className="wrap py-12 sm:py-14">
      <Link href="/app" className="link text-[0.9375rem]">
        Your audits
      </Link>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name !== audit.name) void renameAudit(audit.id, name.trim()).then(() => setAudit({ ...audit, name: name.trim() }));
        }}
      >
        <label className="field min-w-0 flex-1">
          <span className="sr-only">Audit name</span>
          <input className="input !border-transparent !bg-transparent !px-0 text-[1.9rem] font-bold tracking-[-0.015em] hover:!border-rule focus:!border-rule-strong" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>
        {name !== audit.name && (
          <button type="submit" className="btn btn-quiet btn-sm">
            Rename
          </button>
        )}
      </form>
      <p className="mt-1 text-ink-2">
        {audit.file_name}, {plural(audit.rows_scanned, "line")}
        {audit.period_start && audit.period_end ? `, ${isoDate(audit.period_start)} to ${isoDate(audit.period_end)}` : ""}. Saved{" "}
        {dateTime(audit.created_at)}.
      </p>

      <section aria-label="Progress" className="mt-8 grid gap-6 sm:grid-cols-4">
        <div className="border-t-2 border-ink pt-4">
          <p className="text-sm font-bold text-green-ink">At stake</p>
          <p className="num mt-2 text-2xl font-bold">{money(Number(audit.exposure_cents ?? 0), cur)}</p>
        </div>
        <div className="border-t-2 border-ink pt-4">
          <p className="text-sm font-bold text-green-ink">To review</p>
          <p className="num mt-2 text-2xl font-bold">{count(totals.open)}</p>
        </div>
        <div className="border-t-2 border-ink pt-4">
          <p className="text-sm font-bold text-green-ink">Confirmed</p>
          <p className="num mt-2 text-2xl font-bold">{money(totals.confirmedCents, cur)}</p>
        </div>
        <div className="border-t-2 border-ink pt-4">
          <p className="text-sm font-bold text-green-ink">Recovered</p>
          <p className="num mt-2 text-2xl font-bold">
            <span className="total">{money(totals.recoveredCents, cur)}</span>
          </p>
        </div>
      </section>

      <div className="no-print mt-8 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportExcel(findings, meta)}>
          Export to Excel
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => exportCsv(findings, meta)}>
          Export CSV
        </button>
        <div className="ml-auto">
          {confirmDelete ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Delete this audit and its notes?</span>
              <button
                type="button"
                className="btn btn-sm border-pencil bg-pencil text-white hover:bg-pencil-dark"
                onClick={() => void deleteAudit(audit.id).then(() => router.replace("/app"))}
              >
                Delete audit
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmDelete(true)}>
              Delete audit
            </button>
          )}
        </div>
      </div>

      <fieldset className="no-print mt-8">
        <legend className="label">Show</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["all", `All (${findings.filter((f) => !f.reversed).length})`],
              ["open", `To review (${totals.open})`],
              ["confirmed", `Confirmed (${totals.confirmed})`],
              ["recovered", `Recovered (${totals.recovered})`],
              ["not_duplicate", `Not a duplicate (${totals.not_duplicate})`],
            ] as [StatusFilter, string][]
          ).map(([v, label]) => (
            <label key={v} className={`btn btn-sm cursor-pointer ${filter === v ? "btn-primary" : "btn-quiet"}`}>
              <input type="radio" name="status" className="sr-only" checked={filter === v} onChange={() => setFilter(v)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 grid grid-cols-1 gap-6">
        {visible.map((f) => (
          <FindingCard key={f.dbId} f={f} index={findings.indexOf(f) + 1} actions={<CreditEmailButton f={f} />}>
            <FindingTracker f={f} onChange={(p) => patchFinding(f.dbId, p)} />
          </FindingCard>
        ))}
        {visible.length === 0 && <p className="text-ink-2">Nothing here yet.</p>}
      </div>
    </div>
  );
}

export function AuditDetail({ id }: { id: string }) {
  return (
    <RequireAuth>
      <Inner id={id} />
    </RequireAuth>
  );
}
