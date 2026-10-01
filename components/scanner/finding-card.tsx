"use client";

import { TEST_BY_CODE, type Confidence, type FindingRow } from "@/lib/engine/types";
import type { ExportFinding } from "@/lib/export";
import { amount, isoDate, money } from "@/lib/format";

export const CONF_TEXT: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };

export function ConfidenceTag({ c, reversed = false }: { c: Confidence; reversed?: boolean }) {
  if (reversed) return <span className="tag tag-ok">Already reversed</span>;
  return <span className={`tag tag-${c}`}>{CONF_TEXT[c]} confidence</span>;
}

type Col = "vendorName" | "vendorId" | "invoiceNumber" | "invoiceDate" | "paymentDate" | "amountCents";

function differs(rows: FindingRow[], col: Col): boolean {
  if (rows.length < 2) return false;
  const first = String(rows[0][col] ?? "");
  return rows.some((r) => String(r[col] ?? "") !== first);
}

export function FindingCard({
  f,
  index,
  actions,
  children,
}: {
  f: ExportFinding;
  index: number;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const test = TEST_BY_CODE[f.test];
  const d = {
    vendorName: differs(f.rows, "vendorName"),
    vendorId: differs(f.rows, "vendorId"),
    invoiceNumber: differs(f.rows, "invoiceNumber"),
    invoiceDate: differs(f.rows, "invoiceDate"),
    paymentDate: differs(f.rows, "paymentDate"),
    amountCents: differs(f.rows, "amountCents"),
  };
  const hasId = f.rows.some((r) => r.vendorId);
  const hasPaid = f.rows.some((r) => r.paymentDate);
  const hasInvDate = f.rows.some((r) => r.invoiceDate);
  const hasDoc = f.rows.some((r) => r.docId);
  const mark = (on: boolean) => (on ? "pencil" : "");

  return (
    <article className="sheet" aria-labelledby={`finding-${f.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-sm font-bold text-ink-3">#{index}</span>
            <ConfidenceTag c={f.confidence} reversed={f.reversed} />
            <span className="text-sm font-semibold text-ink-2">{test?.name ?? f.test}</span>
          </div>
          <h3 id={`finding-${f.id}`} className="h3 mt-2 break-words">
            {f.vendor}
          </h3>
          <p className="mt-1 max-w-[52em] text-ink-2">{f.reasons[0]}</p>
          {f.reasons.length > 1 && (
            <ul className="mt-2 grid max-w-[52em] gap-1 text-sm text-ink-2">
              {f.reasons.slice(1).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-left sm:text-right">
          <span className="block text-sm text-ink-2">{f.reversed ? "Reversed by a credit" : "At stake"}</span>
          <span className={`num block text-xl font-bold ${f.reversed ? "text-green-ink" : ""}`}>{money(f.exposureCents, f.currency)}</span>
        </div>
      </div>
      <div className="overflow-x-auto border-t border-rule">
        <table className="ledger text-[0.875rem]">
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Vendor</th>
              {hasId && <th scope="col">Vendor ID</th>}
              <th scope="col">Invoice no.</th>
              {hasInvDate && <th scope="col">Invoice date</th>}
              {hasPaid && <th scope="col">Paid</th>}
              <th scope="col" className="r">
                Amount
              </th>
              {hasDoc && <th scope="col">Document</th>}
            </tr>
          </thead>
          <tbody>
            {f.rows.map((r, i) => (
              <tr key={`r${i}`} className={f.reversed ? "" : "flag"}>
                <td className="num">{r.line}</td>
                <td className={`min-w-[10rem] ${mark(d.vendorName)}`}>{r.vendorName}</td>
                {hasId && <td className={`num ${mark(d.vendorId)}`}>{r.vendorId}</td>}
                <td className={`num whitespace-nowrap ${mark(d.invoiceNumber)}`}>{r.invoiceNumber || <span className="faint">(blank)</span>}</td>
                {hasInvDate && <td className={`num whitespace-nowrap ${mark(d.invoiceDate)}`}>{isoDate(r.invoiceDate)}</td>}
                {hasPaid && <td className={`num whitespace-nowrap ${mark(d.paymentDate)}`}>{isoDate(r.paymentDate)}</td>}
                <td className={`num r ${mark(d.amountCents)}`}>{amount(r.amountCents)}</td>
                {hasDoc && <td className="num whitespace-nowrap">{r.docId}</td>}
              </tr>
            ))}
            {f.offsets.map((r, i) => (
              <tr key={`o${i}`} className="credit">
                <td className="num">{r.line}</td>
                <td>
                  {r.vendorName} <span className="text-sm">(credit)</span>
                </td>
                {hasId && <td className="num">{r.vendorId}</td>}
                <td className="num whitespace-nowrap">{r.invoiceNumber}</td>
                {hasInvDate && <td className="num whitespace-nowrap">{isoDate(r.invoiceDate)}</td>}
                {hasPaid && <td className="num whitespace-nowrap">{isoDate(r.paymentDate)}</td>}
                <td className="num r">{amount(r.amountCents)}</td>
                {hasDoc && <td className="num whitespace-nowrap">{r.docId}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(actions || children) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-rule px-5 py-4">
          {actions}
          {children}
        </div>
      )}
    </article>
  );
}
