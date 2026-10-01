import type { Metadata } from "next";
import { PricingTable } from "@/components/pricing-table";
import { Faq } from "@/components/faq";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Scan for free and see the total at stake. Audit Pass for a one-off review, Pro for regular checks, and a Firm plan for accountants.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <>
      <section className="wrap pt-14 pb-16 sm:pt-20">
        <div className="max-w-2xl">
          <h1 className="h2">Pricing</h1>
          <p className="lede mt-4">
            Scan as often as you like for free and see the total at stake in your file. Pay when you want every finding, the Excel export and
            recovery tracking.
          </p>
        </div>
        <div className="mt-10">
          <PricingTable returnTo="/pricing" />
        </div>
      </section>
      <section className="wrap grid gap-10 border-t border-rule pt-16 lg:grid-cols-[1fr_2fr]">
        <h2 className="h2">Questions</h2>
        <Faq />
      </section>
    </>
  );
}
