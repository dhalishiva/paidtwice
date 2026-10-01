"use client";

import { useEffect, useRef, useState } from "react";
import type { ExportFinding } from "@/lib/export";
import { isoDate, money } from "@/lib/format";

export function creditEmail(f: ExportFinding): { subject: string; body: string } {
  const inv = [...new Set(f.rows.map((r) => r.invoiceNumber).filter(Boolean))];
  const main = inv[0] ?? "";
  const subject = main ? `Duplicate payment of invoice ${main}` : `Duplicate payment to ${f.vendor}`;
  const lines = f.rows.map((r) => {
    const parts = [
      r.invoiceNumber ? `Invoice ${r.invoiceNumber}` : "No invoice number",
      r.paymentDate ? `paid ${isoDate(r.paymentDate)}` : r.invoiceDate ? `dated ${isoDate(r.invoiceDate)}` : "",
      money(r.amountCents, f.currency),
    ].filter(Boolean);
    return `- ${parts.join(", ")}`;
  });
  const claim = money(f.exposureCents, f.currency);
  const body = [
    "Hello,",
    "",
    `Our records show the following payments to ${f.vendor} for what appears to be the same invoice:`,
    "",
    ...lines,
    "",
    `Could you confirm that you received these payments and let us know how you would like to settle the overpayment of ${claim}? Either of these works for us:`,
    "",
    `- a refund of ${claim} to the account the payment came from, or`,
    `- a credit note for ${claim} that we can apply against your next invoice.`,
    "",
    "If the payment has already been applied to another invoice on our account, please send a statement showing how it was allocated so we can update our records.",
    "",
    "Thank you,",
    "[Your name]",
    "[Job title], [Company name]",
    "[Phone number]",
  ].join("\n");
  return { subject, body };
}

export function CreditEmailButton({ f }: { f: ExportFinding }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const { subject, body } = creditEmail(f);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => ref.current?.showModal()}>
        Write to the vendor
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[min(680px,calc(100vw-24px))] rounded border border-rule bg-sheet p-0 text-ink shadow-2xl backdrop:bg-ink/40"
        aria-labelledby={`email-${f.id}`}
      >
        <div className="p-5 sm:p-6">
          <h2 id={`email-${f.id}`} className="h3">
            Credit request for {f.vendor}
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            Check both payments left your bank before sending. Fill in the bracketed parts and attach both remittances.
          </p>
          <p className="mt-4 text-sm font-semibold">Subject</p>
          <p className="num mt-1 rounded border border-rule bg-ledger px-3 py-2 text-sm">{subject}</p>
          <p className="mt-4 text-sm font-semibold">Message</p>
          <textarea readOnly className="textarea num mt-1 h-72 text-sm" value={body} aria-label="Email message" />
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary btn-sm" onClick={copy}>
              {copied ? "Copied" : "Copy email"}
            </button>
            <a className="btn btn-quiet btn-sm" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
              Open in your email app
            </a>
            <button type="button" className="btn btn-quiet btn-sm ml-auto" onClick={() => ref.current?.close()}>
              Close
            </button>
          </div>
          <p aria-live="polite" className="sr-only">
            {copied ? "Email copied to the clipboard" : ""}
          </p>
        </div>
      </dialog>
    </>
  );
}
