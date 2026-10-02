import type { Metadata } from "next";
import { PaymentLink } from "@/components/payment-link";

// Paddle's "default payment link": Paddle sends customers here (with ?_ptxn=txn_...) from
// invoices and card-update emails, and Paddle.js opens the checkout for that transaction.
export const metadata: Metadata = {
  title: "Payment",
  robots: { index: false, follow: false },
};

export default function PayPage() {
  return <PaymentLink />;
}
