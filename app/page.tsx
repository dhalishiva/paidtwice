import type { Metadata } from "next";
import Link from "next/link";
import { HeroLedger } from "@/components/hero-ledger";
import { DropZone } from "@/components/drop-zone";
import { Catches } from "@/components/catches";
import { PricingTable } from "@/components/pricing-table";
import { Faq, FAQ } from "@/components/faq";
import { PRICES, SITE, SYSTEMS, listSentence } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    title: "Export your bills",
    text: "Run a bill list, vendor ledger or payment report for the last 12 to 24 months and save it as CSV or Excel.",
  },
  {
    title: "Drop the file in",
    text: "Vendor, invoice number, dates, amount and currency columns are matched for you. Check the matches and start the scan.",
  },
  {
    title: "Review, export, recover",
    text: "Every match shows why it was flagged and the line numbers in your file. Export the list, mark what you confirm and ask the vendor for a credit.",
  },
];

const DATA_ROWS: [string, string][] = [
  ["Your export file", "Read in your browser and never uploaded"],
  ["Lines that are not flagged", "Never leave your computer"],
  ["Flagged lines", "Stored only if you save an audit on a paid plan"],
  ["Your notes and recovered amounts", "Stored with the saved audit, deleted with it"],
  ["Card number and security code", "Handled by Paddle, our payment provider; we only receive the card type, last four digits and expiry"],
  ["Your account", "Email, name and company, stored in London (UK)"],
];

export default function Home() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web browser",
      description: SITE.description,
      url: SITE.url,
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: "Audit Pass", price: String(PRICES.pass), priceCurrency: "USD" },
        { "@type": "Offer", name: "Pro (monthly)", price: String(PRICES.proMonthly), priceCurrency: "USD" },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <section className="wrap grid items-start gap-12 pt-12 pb-20 sm:pt-16 lg:grid-cols-[1.08fr_1fr] lg:gap-16 lg:pt-20">
        <div>
          <h1 className="display max-w-[11ch]">Find the invoices you paid twice.</h1>
          <p className="lede mt-6">
            PaidTwice checks your accounts payable export for bills that were paid more than once, including the ones your accounting
            system&apos;s duplicate check lets through. The file is read in your browser and never uploaded.
          </p>
          <div className="mt-8 max-w-xl">
            <DropZone />
          </div>
          <p className="mt-5 max-w-xl text-[0.9375rem] text-ink-2">
            Works with exports from {listSentence(SYSTEMS)}. The free scan shows the total at stake before you pay anything.
          </p>
        </div>
        <div className="lg:pt-6">
          <HeroLedger />
        </div>
      </section>

      <section id="checks" className="scroll-mt-20 border-t border-rule py-20">
        <div className="wrap">
          <div className="max-w-2xl">
            <h2 className="h2">What it catches</h2>
            <p className="lede mt-4">
              Exact repeats are the easy part. Many duplicates look slightly different the second time, and an exact-match check never
              sees those.
            </p>
          </div>
          <div className="mt-12">
            <Catches />
          </div>
          <p className="mt-12 max-w-2xl text-ink-2">
            Already put right? When a credit note reverses the second payment, the pair is set aside so you do not chase money you already
            have back.
          </p>
        </div>
      </section>

      <section id="privacy" className="scroll-mt-20 border-y border-rule bg-ledger/60 py-20">
        <div className="wrap grid gap-12 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <h2 className="h2 max-w-[14ch]">Your ledger stays on your computer.</h2>
            <p className="lede mt-5">
              The whole scan runs inside your browser. The file is read into memory on your machine, checked, and gone when you close the
              tab.
            </p>
            <p className="mt-4 max-w-[38em] text-ink-2">
              You can check this yourself: open your browser&apos;s developer tools, choose the Network tab and run a scan. Nothing from
              your file is sent. The site&apos;s security policy also tells your browser to refuse connections to anywhere except this site,
              our Supabase backend and Paddle, our payment provider.
            </p>
            <Link href="/security" className="link mt-6 inline-block font-semibold">
              How PaidTwice handles your data
            </Link>
          </div>
          <div className="sheet overflow-x-auto">
            <table className="ledger">
              <caption className="sr-only">What happens to each kind of data</caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">What happens to it</th>
                </tr>
              </thead>
              <tbody>
                {DATA_ROWS.map(([a, b]) => (
                  <tr key={a}>
                    <th scope="row" className="!bg-transparent !text-[0.9375rem] !font-semibold !text-ink">
                      {a}
                    </th>
                    <td className="text-ink-2">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-20 py-20">
        <div className="wrap">
          <h2 className="h2">How a scan works</h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t-2 border-ink pt-5">
                <span className="num text-sm font-bold text-green-ink">Step {i + 1}</span>
                <h3 className="h3 mt-2">{s.title}</h3>
                <p className="mt-2 text-ink-2">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-t border-rule py-20">
        <div className="wrap">
          <div className="max-w-2xl">
            <h2 className="h2">Pricing</h2>
            <p className="lede mt-4">
              Scan as often as you like for free and see the total at stake. Pay when you want every finding, the export and recovery
              tracking.
            </p>
          </div>
          <div className="mt-10">
            <PricingTable returnTo="/pricing" />
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 border-t border-rule py-20">
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_2fr]">
          <h2 className="h2">Questions</h2>
          <Faq />
        </div>
      </section>

      <section className="wrap">
        <div className="flex flex-col items-start justify-between gap-6 border-y-2 border-ink py-10 sm:flex-row sm:items-center">
          <p className="text-2xl font-bold tracking-[-0.01em]">See what is in your file. The first scan is free.</p>
          <Link href="/scan" className="btn btn-primary">
            Scan a file
          </Link>
        </div>
      </section>
    </>
  );
}
