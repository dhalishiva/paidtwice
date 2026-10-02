"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { initPaddle, paddleConfigured } from "@/lib/paddle";

type State = "loading" | "open" | "no-transaction" | "unavailable";

export function PaymentLink() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const hasTxn = new URLSearchParams(window.location.search).has("_ptxn");
    if (!paddleConfigured()) {
      setState("unavailable");
      return;
    }
    initPaddle().then((ok) => setState(!ok ? "unavailable" : hasTxn ? "open" : "no-transaction"));
  }, []);

  return (
    <section className="wrap py-20">
      <div className="max-w-xl" role="status" aria-live="polite">
        <h1 className="h2">Payment</h1>
        {state === "loading" && <p className="lede mt-4">Loading the secure checkout…</p>}
        {state === "open" && (
          <p className="lede mt-4">
            The secure checkout from Paddle, our reseller, opens on this page. If you closed it, reload the page to open it again.
          </p>
        )}
        {state === "no-transaction" && (
          <p className="lede mt-4">
            This page opens a payment link from an invoice or email. To buy a plan, go to{" "}
            <Link className="link text-ink" href="/pricing">
              pricing
            </Link>
            .
          </p>
        )}
        {state === "unavailable" && (
          <p className="lede mt-4">
            The checkout could not be loaded. Check your connection and reload, or{" "}
            <Link className="link text-ink" href="/contact?topic=billing">
              contact us
            </Link>
            .
          </p>
        )}
      </div>
    </section>
  );
}
