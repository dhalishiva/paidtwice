import type { Metadata } from "next";
import Link from "next/link";
import { GA_ID } from "@/lib/analytics";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Security and data handling",
  description:
    "How PaidTwice keeps your accounts payable data private: the scan runs in your browser, the file is never uploaded, and saved audits are stored in London with per-account access rules.",
  alternates: { canonical: "/security" },
};

const STORED: [string, string, string][] = [
  ["Your export file", "Never stored", "Read and scanned in your browser's memory, then discarded when you close the tab."],
  ["Lines that are not flagged", "Never stored", "They never leave your computer, on any plan."],
  ["Flagged lines", "Only if you save an audit", "Paid plans can save the findings shown on screen, with your status notes and recovered amounts."],
  ["Your account", "Stored", "Email address, a hashed password and any name, company and country you add."],
  ["Payments", "Paddle", "Paddle, our reseller, takes the payment. We receive its order and subscription references, never a full card number."],
  ["Enquiries", "Stored", "What you send through the contact form, so we can reply."],
  [
    "Visit statistics",
    GA_ID ? "Vercel; Google if you allow" : "Vercel",
    GA_ID
      ? "Vercel's cookieless statistics record the page address (with record IDs and any query details other than campaign tags removed), browser, device and country. Google Analytics runs only on public pages, and only if you allow analytics cookies."
      : "Vercel's cookieless statistics record the page address (with record IDs and any query details other than campaign tags removed), browser, device and country.",
  ],
];

const MEASURES: { title: string; text: React.ReactNode }[] = [
  {
    title: "The scan runs on your computer",
    text: "The file is read and checked by code running in a background thread of your browser (a Web Worker). There is no upload step in the product, and the scanner has no way to send the file anywhere.",
  },
  {
    title: "Your browser enforces it",
    text: GA_ID
      ? "The scan page and your saved audits carry a Content Security Policy that only lets the browser connect to this site, our Supabase backend and Paddle's checkout. Any other destination is blocked by the browser itself, and no third-party analytics code ever runs on these pages."
      : "Every page carries a Content Security Policy that only lets the browser connect to this site, our Supabase backend and Paddle's checkout. Any other destination is blocked by the browser itself.",
  },
  {
    title: "Saved audits are private to your account",
    text: "Saved audits live in a Supabase Postgres database in London (UK), encrypted at rest. Row-level security rules let each account read only its own audits; billing records are writable only by our server functions.",
  },
  {
    title: "Encrypted in transit",
    text: "All traffic uses HTTPS with HSTS. Other sites cannot frame our pages, and links to other sites pass on only our domain name, never the page address.",
  },
  {
    title: "Passwords and sign-in",
    text: "Passwords are handled by Supabase Auth and stored only as salted hashes. Sign-ups and contact messages are rate limited to slow down abuse.",
  },
  {
    title: "You stay in control",
    text: "Delete a saved audit, or your whole account and every audit in it, yourself from the app at any time.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <section className="wrap pt-14 pb-14 sm:pt-20">
        <div className="max-w-3xl">
          <h1 className="h2">Security and data handling</h1>
          <p className="lede mt-4">
            The safest place for your ledger is your own computer, so that is where PaidTwice scans it. The file is never uploaded, and
            nothing from it leaves your browser unless you choose to save the flagged lines to your account.
          </p>
        </div>
      </section>

      <section aria-labelledby="verify-title" className="border-y border-rule bg-ledger/60 py-14">
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 id="verify-title" className="h3">
              Check it yourself in two minutes
            </h2>
            <p className="mt-3 max-w-[38em] text-ink-2">
              You do not have to take our word for it. Your browser can show you every request this site makes.
            </p>
          </div>
          <ol className="grid gap-4 [counter-reset:step]">
            {[
              "Open the scan page and your browser's developer tools (F12, or Cmd+Option+I on a Mac), then select the Network tab.",
              "Drop your export into PaidTwice and run the scan.",
              "Watch the Network tab: no request carries your file. You can even switch off your Wi-Fi once the scan page has loaded; the scan still works.",
            ].map((t, i) => (
              <li key={t} className="flex gap-4">
                <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink text-sm font-bold">{i + 1}</span>
                <span className="pt-1 text-ink-2">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="stored-title" className="wrap py-16">
        <h2 id="stored-title" className="h2">
          What is stored, and where
        </h2>
        <div className="sheet mt-8 overflow-x-auto">
          <table className="ledger text-[0.9375rem]">
            <caption className="sr-only">What PaidTwice stores for each kind of data</caption>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Stored?</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {STORED.map(([a, b, c]) => (
                <tr key={a}>
                  <th scope="row" className="!bg-transparent !text-[0.9375rem] !font-semibold !text-ink">
                    {a}
                  </th>
                  <td className="whitespace-nowrap font-semibold">{b}</td>
                  <td className="text-ink-2">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="measures-title" className="border-t border-rule py-16">
        <div className="wrap">
          <h2 id="measures-title" className="h2">
            How it is protected
          </h2>
          <div className="mt-10 grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {MEASURES.map((m) => (
              <div key={m.title} className="border-t-2 border-ink pt-4">
                <h3 className="h3">{m.title}</h3>
                <p className="mt-2 text-ink-2">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="providers-title" className="wrap grid gap-10 border-t border-rule py-16 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 id="providers-title" className="h2">
            Providers we use
          </h2>
          <p className="mt-4 max-w-[36em] text-ink-2">
            Each provider only receives what it needs to run its part of the service. None of them ever receives your export file, because we
            never have it.
          </p>
        </div>
        <dl className="divide-y divide-rule border-y border-rule">
          {[
            ["Supabase", "Database, sign-in and server functions. Data stored in the London (UK) region."],
            ["Vercel", "Hosting for the website, its content delivery network, and cookieless visit and speed statistics."],
            ["Paddle", "Checkout, invoicing and tax, as our reseller and Merchant of Record."],
            ["Resend", "Transactional email, where we use it."],
            ...(GA_ID ? [["Google", "Google Analytics on our public pages, only if you allow analytics cookies. Never on the scan page or your audits."]] : []),
          ].map(([name, what]) => (
            <div key={name} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr]">
              <dt className="font-bold">{name}</dt>
              <dd className="text-ink-2">{what}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="honest-title" className="wrap border-t border-rule py-16">
        <div className="max-w-3xl">
          <h2 id="honest-title" className="h2">
            What we do not claim
          </h2>
          <p className="mt-4 text-ink-2">
            PaidTwice is run by a small team and does not hold SOC 2 or ISO 27001 certification. Because your ledger never reaches our
            servers, most of what those audits cover does not apply to the scan itself. If your organisation needs a security questionnaire
            answered, we are happy to help.
          </p>
          <h2 className="h3 mt-10">Reporting a vulnerability</h2>
          <p className="mt-3 text-ink-2">
            If you find a security problem, please tell us before making it public, through the{" "}
            <Link href="/contact?topic=security" className="link text-ink">
              contact form
            </Link>
            {SITE.emailConfigured ? (
              <>
                {" "}
                or at{" "}
                <a className="link text-ink" href={`mailto:${SITE.email}`}>
                  {SITE.email}
                </a>
              </>
            ) : null}
            . We will acknowledge it quickly and keep you updated.
          </p>
          <p className="mt-8">
            <Link href="/privacy" className="link font-semibold">
              Read the privacy policy
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
