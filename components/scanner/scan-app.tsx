"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useScan } from "@/lib/scan-store";
import { DropZone } from "../drop-zone";
import { MappingStep } from "./mapping-step";
import { Results } from "./results";

const EXPORTS: { system: string; how: string; guide?: string }[] = [
  {
    system: "QuickBooks Online",
    how: "Reports, Transaction List by Vendor, filtered to bills and bill payments, then Export to Excel.",
    guide: "/guides/find-duplicate-payments-quickbooks-online",
  },
  { system: "Xero", how: "Reports, Payable Invoice Detail for the last 12 months, then Export to Excel.", guide: "/guides/xero-duplicate-bills" },
  { system: "SAP", how: "FBL1N vendor line items with all items for the period, then export to spreadsheet.", guide: "/guides/sap-duplicate-invoice-check" },
  { system: "NetSuite", how: "A saved search or transaction report of vendor bills, exported as CSV or Excel." },
  { system: "Sage, MYOB, Dynamics", how: "Any supplier or vendor transactions report with invoice numbers, exported as CSV." },
];

function Working({ stage }: { stage: string }) {
  return (
    <div className="mx-auto max-w-lg py-24 text-center" role="status" aria-live="polite">
      <p className="text-xl font-bold">{stage || "Working"}…</p>
      <div className="mx-auto mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-ledger-2">
        <div className="h-full w-1/3 animate-[slide_1.1s_ease-in-out_infinite] rounded-full bg-ink motion-reduce:animate-none" />
      </div>
      <p className="mt-6 text-ink-2">Your file is being read on this computer. Nothing is uploaded.</p>
    </div>
  );
}

function Idle() {
  return (
    <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <h1 className="h2">Scan an accounts payable export</h1>
        <p className="lede mt-4">
          Choose a CSV or Excel file of bills or vendor invoices. It is read in your browser, checked, and never uploaded.
        </p>
        <div className="mt-8">
          <DropZone />
        </div>
      </div>
      <section aria-labelledby="export-title" className="lg:pt-2">
        <h2 id="export-title" className="h3">
          What to export
        </h2>
        <p className="mt-2 text-ink-2">
          Twelve to 24 months of bills, with vendor, invoice number, date and amount. More history finds more, because duplicates are often
          paid weeks apart.
        </p>
        <dl className="mt-5 divide-y divide-rule border-y border-rule">
          {EXPORTS.map((e) => (
            <div key={e.system} className="py-3">
              <dt className="font-semibold">{e.system}</dt>
              <dd className="mt-1 text-[0.9375rem] text-ink-2">
                {e.how}{" "}
                {e.guide && (
                  <Link href={e.guide} className="link whitespace-nowrap text-ink">
                    Read the guide
                  </Link>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function ScanInner() {
  const s = useScan();
  return (
    <div className="wrap py-10 sm:py-14">
      {s.phase === "idle" && <Idle />}
      {(s.phase === "reading" || s.phase === "scanning") && <Working stage={s.stage} />}
      {s.phase === "mapping" && <MappingStep />}
      {s.phase === "results" && <Results />}
    </div>
  );
}

export function ScanApp() {
  return (
    <Suspense fallback={<div className="wrap py-14" />}>
      <ScanInner />
    </Suspense>
  );
}
