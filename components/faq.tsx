import Link from "next/link";
import { SYSTEMS, listSentence } from "@/lib/site";

export const FAQ: { q: string; a: string; link?: { href: string; label: string } }[] = [
  {
    q: "Is my file uploaded anywhere?",
    a: "No. PaidTwice reads the file inside your browser, on your computer, and the scan never sends it to a server. If you save an audit on a paid plan, only the flagged lines and your notes are stored, never the file.",
    link: { href: "/security", label: "How we handle data" },
  },
  {
    q: "Which accounting systems does it work with?",
    a: `Any system that exports to CSV or Excel. Columns in exports from ${listSentence(SYSTEMS)} are usually matched automatically, including QuickBooks reports grouped by vendor and Xero's line-by-line bills export, and you can correct any match before scanning.`,
  },
  {
    q: "What should I export?",
    a: "A list of bills or vendor invoices for the last 12 to 24 months, with the vendor name or ID, invoice number, invoice or payment date and amount. A vendor ledger or payment report also works. If your system can include a document type column, credits are recognised more precisely.",
  },
  {
    q: "How accurate is it?",
    a: "Each finding comes with a confidence level and the reason it was flagged, so you can check it in a minute. Regular weekly and monthly charges are recognised and left out, and duplicates already reversed by a credit note are set aside. Always confirm a finding against the source documents and your bank statement before contacting a vendor.",
  },
  {
    q: "What do I do when I find one?",
    a: "Confirm both payments left your bank, then ask the vendor for a refund or a credit note. Paid plans include a ready-to-send credit request for each finding.",
    link: { href: "/guides/recover-duplicate-payment-from-vendor", label: "How to recover a duplicate payment" },
  },
  {
    q: "Can we pay by invoice?",
    a: "Yes, for the Firm plan and for annual Pro. Get in touch and Paddle, our reseller, will send an invoice you can pay by bank transfer or card.",
    link: { href: "/contact?topic=invoice", label: "Ask for an invoice" },
  },
  {
    q: "Can I get a refund?",
    a: "Yes. If PaidTwice is not right for you, ask within 14 days of your first purchase for a full refund.",
    link: { href: "/refunds", label: "Refund policy" },
  },
];

export function Faq() {
  return (
    <div className="divide-y divide-rule border-y border-rule">
      {FAQ.map((f) => (
        <details key={f.q} className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-lg font-bold [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden="true" className="text-2xl font-normal text-green-ink transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="max-w-[44em] pb-5 text-ink-2">
            <p>{f.a}</p>
            {f.link && (
              <p className="mt-3">
                <Link href={f.link.href} className="link font-semibold text-ink">
                  {f.link.label}
                </Link>
              </p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
