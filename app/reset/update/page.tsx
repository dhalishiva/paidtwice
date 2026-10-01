import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function UpdatePasswordPage() {
  return <UpdatePasswordForm />;
}
