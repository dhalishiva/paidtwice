"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listAudits, type AuditRow, type AuditSummary } from "@/lib/audits";
import { count, dateTime, isoDate, money } from "@/lib/format";
import { useAuth } from "./auth-provider";
import { RequireAuth, planLabel } from "./require-auth";

function PlanNote() {
  const { plan, entitlement } = useAuth();
  if (plan === "free") {
    return (
      <p className="mt-6 rounded border border-rule bg-sheet px-4 py-3 text-ink-2">
        You are on the free plan: scans show the total at stake and the top three findings. Saving audits and tracking recoveries come with an{" "}
        <Link href="/pricing" className="link font-semibold text-ink">
          Audit Pass or Pro
        </Link>
        .
      </p>
    );
  }
  const until = plan === "pro" ? entitlement?.pro_until : entitlement?.pass_until;
  return (
    <p className="mt-6 rounded border border-rule-strong bg-ledger px-4 py-3 text-green-ink">
      {planLabel(plan)}: every finding, export and saved audit is unlocked
      {until ? (plan === "pass" ? ` until ${dateTime(until)}` : `, paid through ${dateTime(until)}`) : ""}.
    </p>
  );
}

function Inner() {
  const [data, setData] = useState<{ audits: AuditRow[]; summaries: Map<string, AuditSummary> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAudits()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Your audits could not be loaded."));
  }, []);

  const totals = new Map<string, { exposure: number; confirmed: number; recovered: number }>();
  for (const a of data?.audits ?? []) {
    const c = a.currency || "USD";
    const t = totals.get(c) ?? { exposure: 0, confirmed: 0, recovered: 0 };
    const s = data?.summaries.get(a.id);
    t.exposure += Number(a.exposure_cents ?? 0);
    t.confirmed += Number(s?.confirmed_cents ?? 0);
    t.recovered += Number(s?.recovered_cents ?? 0);
    totals.set(c, t);
  }

  return (
    <div className="wrap py-12 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="h2">Your audits</h1>
        <div className="flex gap-3">
          <Link href="/account" className="btn btn-quiet btn-sm">
            Account
          </Link>
          <Link href="/scan" className="btn btn-primary btn-sm">
            New scan
          </Link>
        </div>
      </div>
      <PlanNote />

      {error && (
        <p role="alert" className="error-text mt-8">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="mt-10 text-ink-2" role="status">
          Loading your audits…
        </p>
      )}

      {data && data.audits.length === 0 && (
        <section className="mt-10 max-w-2xl">
          <h2 className="h3">No saved audits yet</h2>
          <p className="mt-2 text-ink-2">
            Run a scan, then choose “Save audit and track recoveries”. Each finding gets a status, a recovered amount and a note, so you can
            see what has come back.
          </p>
          <Link href="/scan" className="btn btn-primary mt-5">
            Scan a file
          </Link>
        </section>
      )}

      {data && data.audits.length > 0 && (
        <>
          <section aria-label="Totals" className="mt-10 grid gap-6 sm:grid-cols-3">
            {[...totals.entries()].map(([cur, t]) => (
              <div key={cur} className="contents">
                <div className="border-t-2 border-ink pt-4">
                  <p className="text-sm font-bold text-green-ink">Flagged{totals.size > 1 ? ` (${cur})` : ""}</p>
                  <p className="num mt-2 text-2xl font-bold">{money(t.exposure, cur)}</p>
                </div>
                <div className="border-t-2 border-ink pt-4">
                  <p className="text-sm font-bold text-green-ink">Confirmed duplicates</p>
                  <p className="num mt-2 text-2xl font-bold">{money(t.confirmed, cur)}</p>
                </div>
                <div className="border-t-2 border-ink pt-4">
                  <p className="text-sm font-bold text-green-ink">Recovered</p>
                  <p className="num mt-2 text-2xl font-bold">
                    <span className="total">{money(t.recovered, cur)}</span>
                  </p>
                </div>
              </div>
            ))}
          </section>

          <div className="sheet mt-10 overflow-x-auto">
            <table className="ledger">
              <caption className="sr-only">Saved audits</caption>
              <thead>
                <tr>
                  <th scope="col">Audit</th>
                  <th scope="col" className="r">
                    Lines
                  </th>
                  <th scope="col" className="r">
                    Findings
                  </th>
                  <th scope="col" className="r">
                    At stake
                  </th>
                  <th scope="col" className="r">
                    Recovered
                  </th>
                  <th scope="col">Saved</th>
                </tr>
              </thead>
              <tbody>
                {data.audits.map((a) => {
                  const s = data.summaries.get(a.id);
                  const cur = a.currency || "USD";
                  return (
                    <tr key={a.id}>
                      <td className="min-w-[14rem]">
                        <Link href={`/app/audits/${a.id}`} className="link font-semibold">
                          {a.name}
                        </Link>
                        <span className="block text-sm text-ink-3">
                          {a.period_start && a.period_end ? `${isoDate(a.period_start)} to ${isoDate(a.period_end)}` : a.file_name}
                        </span>
                      </td>
                      <td className="num r">{count(a.rows_scanned)}</td>
                      <td className="num r">
                        {count(a.finding_count)}
                        {s && s.confirmed_count + s.recovered_count > 0 && (
                          <span className="block text-sm text-ink-3">{s.confirmed_count + s.recovered_count} confirmed</span>
                        )}
                      </td>
                      <td className="num r">{money(Number(a.exposure_cents ?? 0), cur)}</td>
                      <td className="num r">{money(Number(s?.recovered_cents ?? 0), cur)}</td>
                      <td className="whitespace-nowrap">{dateTime(a.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function Dashboard() {
  return (
    <RequireAuth>
      <Inner />
    </RequireAuth>
  );
}
