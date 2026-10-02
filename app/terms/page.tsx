import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using PaidTwice, including plans, payment through Paddle, cancellation and liability.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalDoc page="terms" title="Terms of service" />;
}
