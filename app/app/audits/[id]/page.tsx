import type { Metadata } from "next";
import { AuditDetail } from "@/components/audit-detail";

export const metadata: Metadata = { title: "Saved audit", robots: { index: false } };

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditDetail id={id} />;
}
