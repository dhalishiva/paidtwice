import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions about PaidTwice, the Firm plan for accountants and outsourced AP teams, or paying by invoice.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="wrap grid gap-12 py-14 sm:py-20 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <h1 className="h2">Talk to us</h1>
        <p className="lede mt-4">Questions about PaidTwice, the Firm plan, paying by invoice or your data. A person reads every message.</p>
        {SITE.emailConfigured && (
          <p className="mt-6 text-ink-2">
            Prefer email? Write to{" "}
            <a className="link text-ink" href={`mailto:${SITE.email}`}>
              {SITE.email}
            </a>
            .
          </p>
        )}
      </div>
      <ContactForm />
    </div>
  );
}
