"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TESTS, TEST_BY_CODE, type Finding, type TestCode } from "@/lib/engine/types";
import { backToMapping, markSaved, resetScan, useScan } from "@/lib/scan-store";
import { exportCsv, exportExcel, type ExportFinding } from "@/lib/export";
import { saveAudit } from "@/lib/audits";
import { count, isoDate, money, plural } from "@/lib/format";
import { FREE_FINDINGS, PRICES } from "@/lib/site";
import type { PaidPlan } from "@/lib/paddle";
import { useAuth } from "../auth-provider";
import { useCheckout } from "../checkout";
import { LockIcon } from "../drop-zone";
import { CONF_TEXT, ConfidenceTag, FindingCard } from "./finding-card";
import { CreditEmailButton } from "./credit-email";

type ConfFilter = "all" | "high" | "medium" | "low" | "reversed";
const PAGE = 40;

function toExport(f: Finding): ExportFinding {
  return f;
}

export function Results() {
  const { result, info, isSample, savedAuditId, resultFor } = useScan();
  const { user, plan, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { buy, state: checkout } = useCheckout("/scan");
  const [conf, setConf] = useState<ConfFilter>("all");
  const [test, setTest] = useState<TestCode | "all">("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const started = useRef(false);
  const paywallRef = useRef<HTMLElement>(null);

  const paid = plan !== "free";
  const unlocked = paid || isSample;

  useEffect(() => {
    const want = params.get("buy") as PaidPlan | null;
    if (!want || started.current || !ready || !user || paid) return;
    if (!["pass", "pro_monthly", "pro_yearly"].includes(want)) return;
    started.current = true;
    void buy(want);
  }, [params, ready, user, paid, buy]);

  const findings = result?.findings ?? [];
  const active = useMemo(() => findings.filter((f) => !f.reversed), [findings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings.filter((f) => {
      if (conf === "reversed" ? !f.reversed : f.reversed) return false;
      if (conf !== "all" && conf !== "reversed" && f.confidence !== conf) return false;
      if (test !== "all" && f.test !== test) return false;
      if (q && !f.vendor.toLowerCase().includes(q) && !f.rows.some((r) => r.invoiceNumber.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [findings, conf, test, query]);

  useEffect(() => setShown(PAGE), [conf, test, query]);

  if (!result || !info) return null;
  const s = result.stats;
  const primary = s.currencies[0];
  const cur = primary?.currency ?? s.primaryCurrency;
  const exposure = primary?.exposureCents ?? 0;
  const lowExposure = primary?.lowExposureCents ?? 0;
  const likely = s.byConfidence.high.count + s.byConfidence.medium.count;
  const visible = unlocked ? filtered.slice(0, shown) : active.slice(0, FREE_FINDINGS);
  const locked = unlocked ? [] : active.slice(FREE_FINDINGS);
  const lockedExposure = locked.reduce((a, f) => a + (f.currency === cur && f.confidence !== "low" ? f.exposureCents : 0), 0);
  const fileName = resultFor?.fileName || info.fileName;
  const meta = { title: `Duplicate payment review: ${fileName}`, fileName, scannedAt: resultFor?.at ?? new Date().toISOString(), stats: s };

  const needUnlock = () => paywallRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  const onSave = async () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent("/scan")}`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const name = `${fileName.replace(/\.[^.]+$/, "")} (${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})`;
      const id = await saveAudit(result, fileName, name);
      markSaved(id);
      router.push(`/app/audits/${id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "The audit could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="h2">Results</h1>
          <p className="mt-2 break-words text-ink-2">
            <span className="font-semibold text-ink">{fileName}</span>, scanned on this computer in{" "}
            {s.durationMs < 1000 ? "under a second" : `${(s.durationMs / 1000).toFixed(1)} seconds`}.
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className="btn btn-quiet btn-sm" onClick={backToMapping}>
            Change columns
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={resetScan}>
            Scan another file
          </button>
        </div>
      </div>

      {isSample && (
        <p className="mt-6 rounded border border-rule-strong bg-ledger px-4 py-3 text-green-ink">
          This is a sample export from a made-up company, with duplicates planted in it. Everything is unlocked so you can see the full
          report. Your own files show the top {FREE_FINDINGS} findings free.
        </p>
      )}

      <section aria-labelledby="summary-title" className="sheet mt-8 grid md:grid-cols-[1.1fr_1fr]">
        <div className="border-b border-rule p-5 sm:p-6 md:border-r md:border-b-0">
          <h2 id="summary-title" className="text-sm font-bold text-green-ink">
            At stake
          </h2>
          <p className="num mt-3 text-[2.4rem] font-bold leading-none sm:text-[2.8rem]">
            <span className="total">{money(exposure, cur)}</span>
          </p>
          <p className="mt-4 max-w-[36em] text-ink-2">
            {likely > 0 ? (
              <>
                <strong className="text-ink">{plural(likely, "likely duplicate")}</strong> in {plural(s.rowsUsed, "line")} from{" "}
                {plural(s.vendors, "vendor")}
              </>
            ) : (
              <>
                No likely duplicates in {plural(s.rowsUsed, "line")} from {plural(s.vendors, "vendor")}
              </>
            )}
            {s.dateMin && s.dateMax ? `, ${isoDate(s.dateMin)} to ${isoDate(s.dateMax)}` : ""}.
          </p>
          {s.byConfidence.low.count > 0 && (
            <p className="mt-2 max-w-[36em] text-sm text-ink-2">
              Plus {plural(s.byConfidence.low.count, "low-confidence lead")} ({money(lowExposure, cur, { whole: true })}) worth a quick
              look. They are not counted in the total.
            </p>
          )}
          {s.findings > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {(["high", "medium", "low"] as const).map((c) =>
                s.byConfidence[c].count ? (
                  <li key={c} className={`tag tag-${c}`}>
                    {CONF_TEXT[c]}: {s.byConfidence[c].count}, {money(s.byConfidence[c].exposureCents, cur, { whole: true })}
                  </li>
                ) : null,
              )}
            </ul>
          )}
          {s.reversedFindings > 0 && (
            <p className="mt-4 text-sm text-ink-2">
              {plural(s.reversedFindings, "more duplicate was", "more duplicates were")} already reversed by a credit note and{" "}
              {s.reversedFindings === 1 ? "is" : "are"} set aside.
            </p>
          )}
          {s.currencies.length > 1 && (
            <ul className="mt-4 grid gap-1 text-sm text-ink-2">
              {s.currencies.slice(1).map((c) => (
                <li key={c.currency}>
                  Also at stake in {c.currency}: <span className="num font-semibold text-ink">{money(c.exposureCents, c.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="overflow-x-auto p-5 sm:p-6">
          <h2 className="text-sm font-bold text-green-ink">By check</h2>
          <table className="ledger mt-3 text-[0.875rem]">
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col" className="r">
                  Found
                </th>
                <th scope="col" className="r">
                  At stake
                </th>
              </tr>
            </thead>
            <tbody>
              {TESTS.map((t) => {
                const b = s.byTest[t.code];
                const off = !result.settings.tests[t.code];
                return (
                  <tr key={t.code}>
                    <td className={b.count ? "" : "text-ink-3"}>{t.name}</td>
                    <td className={`num r ${b.count ? "font-bold" : "text-ink-3"}`}>{off ? "off" : b.count}</td>
                    <td className={`num r ${b.count ? "" : "text-ink-3"}`}>{b.count ? money(b.exposureCents, cur, { whole: true }) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {(result.warnings.length > 0 || s.rowsSkipped > 0) && (
        <section aria-label="Notes about this file" className="mt-6 grid gap-2 rounded border border-rule bg-sheet px-4 py-3 text-[0.9375rem] text-ink-2">
          {result.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          {s.rowsSkipped > 0 && (
            <details>
              <summary className="cursor-pointer">
                {plural(s.rowsSkipped, "line was", "lines were")} not checked. See why.
              </summary>
              <ul className="mt-2 grid gap-1 pl-4">
                {Object.entries(s.skippedReasons).map(([why, n]) => (
                  <li key={why}>
                    {count(n)}: {why}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <div className="no-print mt-6 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => (unlocked ? exportExcel(findings.map(toExport), meta) : needUnlock())}>
          {!unlocked && <LockIcon />} Export to Excel
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => (unlocked ? exportCsv(findings.map(toExport), meta) : needUnlock())}>
          {!unlocked && <LockIcon />} Export CSV
        </button>
        {paid && !isSample && (
          savedAuditId ? (
            <Link className="btn btn-quiet btn-sm" href={`/app/audits/${savedAuditId}`}>
              Open saved audit
            </Link>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={saving || s.findings + s.reversedFindings === 0} onClick={onSave}>
              {saving ? "Saving…" : "Save audit and track recoveries"}
            </button>
          )
        )}
        {paid && isSample && <span className="text-sm text-ink-2">Saving is turned off for the sample file.</span>}
        {saveError && (
          <p role="alert" className="error-text w-full">
            {saveError}
          </p>
        )}
      </div>

      {s.findings + s.reversedFindings === 0 ? (
        <section className="mt-10 max-w-2xl">
          <h2 className="h3">Nothing looks paid twice</h2>
          <p className="mt-2 text-ink-2">
            That is a good result. Before you rely on it, check that the vendor, invoice number, date and amount columns were matched
            correctly, and that the file covers at least a year of bills. Duplicates often sit months apart.
          </p>
          <button type="button" className="btn btn-quiet btn-sm mt-4" onClick={backToMapping}>
            Check the columns
          </button>
        </section>
      ) : (
        <section aria-labelledby="findings-title" className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="findings-title" className="h3">
              {unlocked ? "Possible duplicates" : `Possible duplicates, top ${Math.min(FREE_FINDINGS, active.length)} of ${active.length}`}
            </h2>
            {unlocked && (
              <p className="text-sm text-ink-2" aria-live="polite">
                Showing {Math.min(shown, filtered.length)} of {filtered.length}
              </p>
            )}
          </div>

          {unlocked && (
            <div className="no-print mt-4 grid gap-4 rounded border border-rule bg-sheet p-4 lg:grid-cols-[auto_1fr_1fr] lg:items-end">
              <fieldset>
                <legend className="label">Show</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["all", "All open"],
                      ["high", "High"],
                      ["medium", "Medium"],
                      ["low", "Low"],
                      ["reversed", "Already reversed"],
                    ] as [ConfFilter, string][]
                  ).map(([v, label]) => (
                    <label key={v} className={`btn btn-sm cursor-pointer ${conf === v ? "btn-primary" : "btn-quiet"}`}>
                      <input type="radio" name="conf" value={v} className="sr-only" checked={conf === v} onChange={() => setConf(v)} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field">
                <span className="label">Check</span>
                <select className="select" value={test} onChange={(e) => setTest(e.target.value as TestCode | "all")}>
                  <option value="all">All checks</option>
                  {TESTS.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name} ({s.byTest[t.code].count})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Vendor or invoice number</span>
                <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
              </label>
            </div>
          )}

          <div className="mt-6 grid gap-6">
            {visible.map((f, i) => (
              <FindingCard key={f.id} f={f} index={unlocked ? filtered.indexOf(f) + 1 : i + 1} actions={unlocked && !f.reversed ? <CreditEmailButton f={f} /> : undefined} />
            ))}
            {unlocked && filtered.length === 0 && <p className="text-ink-2">No findings match these filters.</p>}
          </div>
          {unlocked && filtered.length > shown && (
            <button type="button" className="btn btn-quiet mt-6" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, filtered.length - shown)} more
            </button>
          )}

          {!unlocked && locked.length > 0 && (
            <>
              <section ref={paywallRef} aria-labelledby="unlock-title" className="mt-10 rounded border-2 border-ink bg-sheet p-5 sm:p-7">
                <h2 id="unlock-title" className="h3">
                  {plural(locked.length, "more finding")}
                  {lockedExposure > 0 ? `, ${money(lockedExposure, cur)} likely at stake` : ""}
                </h2>
                <p className="mt-2 max-w-[44em] text-ink-2">
                  Unlock every finding with the lines to check in your file, export the list to Excel, save the audit to track what you
                  recover, and send each vendor a ready-made credit request.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" className="btn btn-primary" disabled={checkout.busy !== null} onClick={() => void buy("pass")}>
                    {checkout.busy === "pass" ? "Opening checkout…" : `Unlock with Audit Pass, $${PRICES.pass}`}
                  </button>
                  <button type="button" className="btn btn-secondary" disabled={checkout.busy !== null} onClick={() => void buy("pro_monthly")}>
                    {checkout.busy === "pro_monthly" ? "Opening checkout…" : `Pro, $${PRICES.proMonthly} a month`}
                  </button>
                </div>
                <p className="mt-4 text-sm text-ink-2">
                  {user ? "" : "You will create an account first; it takes under a minute and your results stay on this page. "}
                  Audit Pass is a single payment for 30 days of full access. Full refund within 14 days of your first purchase.
                </p>
                {(checkout.message || checkout.error) && (
                  <p role="status" className={`mt-4 font-semibold ${checkout.error ? "text-pencil-dark" : "text-green-ink"}`}>
                    {checkout.error ?? checkout.message}
                  </p>
                )}
              </section>

              <div className="sheet mt-6 overflow-x-auto">
                <table className="ledger text-[0.875rem]">
                  <caption className="sr-only">Locked findings</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Confidence</th>
                      <th scope="col">Check</th>
                      <th scope="col">Vendor</th>
                      <th scope="col" className="r">
                        At stake
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {locked.slice(0, 50).map((f, i) => (
                      <tr key={f.id}>
                        <td className="num text-ink-3">{FREE_FINDINGS + i + 1}</td>
                        <td>
                          <ConfidenceTag c={f.confidence} />
                        </td>
                        <td>{TEST_BY_CODE[f.test]?.name}</td>
                        <td>
                          <span className="inline-flex items-center gap-2 text-ink-3">
                            <LockIcon /> Unlock to see
                          </span>
                        </td>
                        <td className="num r">{money(f.exposureCents, f.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {locked.length > 50 && <p className="px-4 py-3 text-sm text-ink-2">and {count(locked.length - 50)} more.</p>}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
