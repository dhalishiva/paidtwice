import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";

export const metadata: Metadata = {
  title: "Refund policy",
  description: "Full refund within 14 days of your first PaidTwice purchase. How refunds and cancellations work with Paddle.",
  alternates: { canonical: "/refunds" },
};

export default function RefundsPage() {
  return <LegalDoc page="refunds" title="Refund policy" />;
}
