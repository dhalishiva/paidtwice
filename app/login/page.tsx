import type { Metadata } from "next";
import { SignInForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false }, alternates: { canonical: "/login" } };

export default function LoginPage() {
  return <SignInForm />;
}
