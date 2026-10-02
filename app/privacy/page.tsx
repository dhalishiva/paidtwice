import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What PaidTwice collects, why, where it is stored and your rights. Your accounts payable file never leaves your browser.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalDoc page="privacy" title="Privacy policy" />;
}
