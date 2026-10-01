import type { Metadata } from "next";
import { ScanApp } from "@/components/scanner/scan-app";

export const metadata: Metadata = {
  title: "Scan an accounts payable export",
  description: "Drop in a CSV or Excel export of your bills and find possible duplicate payments. The file is scanned in your browser and never uploaded.",
  alternates: { canonical: "/scan" },
};

export default function ScanPage() {
  return <ScanApp />;
}
