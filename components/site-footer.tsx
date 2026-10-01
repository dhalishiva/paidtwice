import Link from "next/link";
import { getGuides } from "@/lib/content";
import { SITE } from "@/lib/site";
import { Wordmark } from "./logo";

export function SiteFooter() {
  const guides = getGuides();
  return (
    <footer className="mt-28 border-t border-rule bg-ledger/50">
      <div className="wrap grid gap-10 py-14 md:grid-cols-[1.5fr_1fr_1.4fr_1fr]">
        <div className="max-w-xs">
          <Wordmark />
          <p className="mt-4 text-[0.9375rem] text-ink-2">
            Duplicate payment checks for finance teams. Your file is scanned in your browser and never uploaded.
          </p>
        </div>
        <FooterList
          title="Product"
          links={[
            { href: "/scan", label: "Scan a file" },
            { href: "/pricing", label: "Pricing" },
            { href: "/security", label: "Security" },
            { href: "/contact", label: "Contact" },
          ]}
        />
        <FooterList title="Guides" links={guides.map((g) => ({ href: `/guides/${g.slug}`, label: g.title.split(":")[0] }))} />
        <FooterList
          title="Legal"
          links={[
            { href: "/terms", label: "Terms of service" },
            { href: "/privacy", label: "Privacy policy" },
            { href: "/refunds", label: "Refund policy" },
          ]}
        />
      </div>
      <div className="border-t border-rule">
        <p className="wrap py-6 text-sm text-ink-3">
          © {new Date().getFullYear()} {SITE.company}. PaidTwice flags possible duplicates. Confirm each one against the source documents
          before you contact a vendor.
        </p>
      </div>
    </footer>
  );
}

function FooterList({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-green-ink">{title}</h2>
      <ul className="mt-3 grid gap-2 text-[0.9375rem]">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-ink-2 no-underline hover:text-ink hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
