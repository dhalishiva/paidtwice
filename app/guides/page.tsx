import type { Metadata } from "next";
import Link from "next/link";
import { getGuides } from "@/lib/content";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "Practical guides for finance teams: finding duplicate payments in QuickBooks Online, Xero and SAP, and recovering a duplicate payment from a vendor.",
  alternates: { canonical: "/guides" },
};

export default function GuidesPage() {
  const guides = getGuides();
  return (
    <section className="wrap py-14 sm:py-20">
      <div className="max-w-2xl">
        <h1 className="h2">Guides</h1>
        <p className="lede mt-4">
          How duplicate payments get past the checks in common accounting systems, what to export, and how to get the money back.
        </p>
      </div>
      <ul className="mt-12 grid gap-6 md:grid-cols-2">
        {guides.map((g) => (
          <li key={g.slug}>
            <Link href={`/guides/${g.slug}`} className="sheet group block h-full p-6 no-underline transition-colors hover:border-rule-strong">
              <span className="text-sm font-semibold text-green-ink">{g.minutes} minute read</span>
              <h2 className="h3 mt-2 group-hover:underline group-hover:underline-offset-4">{g.title}</h2>
              <p className="mt-2 text-ink-2">{g.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
