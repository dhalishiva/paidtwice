import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "Your audits", robots: { index: false } };

export default function AppHome() {
  return <Dashboard />;
}
