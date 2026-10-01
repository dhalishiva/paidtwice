import type { Metadata } from "next";
import { ResetForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ResetPage() {
  return <ResetForm />;
}
