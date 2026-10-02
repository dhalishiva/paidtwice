"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { PRICES } from "@/lib/site";
import type { PaidPlan } from "@/lib/paddle";
import { useAuth } from "./auth-provider";
import { useCheckout } from "./checkout";

type PlanKey = "free" | "pass" | "pro" | "firm";

const PLANS: { key: PlanKey; name: string; price: string; unit: string; fit: string }[] = [
  { key: "free", name: "Free", price: "$0", unit: "no account needed", fit: "See what is at stake in your file." },
  { key: "pass", name: "Audit Pass", price: `$${PRICES.pass}`, unit: "one payment, 30 days", fit: "A one-off review before year end or an audit." },
  { key: "pro", name: "Pro", price: `$${PRICES.proMonthly}`, unit: `a month, or $${PRICES.proYearly} a year`, fit: "Regular checks before each payment run." },
  { key: "firm", name: "Firm", price: "Quote", unit: "for accountants and outsourced AP", fit: "Many clients or entities, billed by invoice." },
];

type Mark = boolean | string;
const ROWS: { label: string; values: Record<PlanKey, Mark> }[] = [
  { label: "Unlimited scans in your browser", values: { free: true, pass: true, pro: true, firm: true } },
  { label: "Total at stake and counts by check", values: { free: true, pass: true, pro: true, firm: true } },
  { label: "Findings shown in full", values: { free: "Top 3", pass: "All", pro: "All", firm: "All" } },
  { label: "Excel and CSV export", values: { free: false, pass: true, pro: true, firm: true } },
  { label: "Saved audits and recovery tracking", values: { free: false, pass: true, pro: true, firm: true } },
  { label: "Credit request email for each finding", values: { free: false, pass: true, pro: true, firm: true } },
  { label: "Access", values: { free: "Always", pass: "30 days, no renewal", pro: "Cancel any time", firm: "Agreed term" } },
];

function Value({ v }: { v: Mark }) {
  if (v === true)
    return (
      <span className="text-green-ink" aria-label="Included">
        <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
          <path d="M1.5 7.5l4.5 4.5L16.5 1.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (v === false)
    return (
      <span className="text-ink-3" aria-label="Not included">
        –
      </span>
    );
  return <span>{v}</span>;
}

function Actions({ plan, buy, busy, loggedIn }: { plan: PlanKey; buy: (p: PaidPlan) => void; busy: PaidPlan | null; loggedIn: boolean }) {
  if (plan === "free")
    return (
      <Link href="/scan" className="btn btn-quiet w-full">
        Scan a file
      </Link>
    );
  if (plan === "firm")
    return (
      <Link href="/contact?topic=firm" className="btn btn-quiet w-full">
        Talk to us
      </Link>
    );
  if (plan === "pass")
    return (
      <button type="button" className="btn btn-primary w-full" disabled={busy !== null} onClick={() => buy("pass")}>
        {busy === "pass" ? "Opening checkout…" : "Buy Audit Pass"}
      </button>
    );
  return (
    <div className="grid w-full gap-2">
      <button type="button" className="btn btn-secondary w-full" disabled={busy !== null} onClick={() => buy("pro_monthly")}>
        {busy === "pro_monthly" ? "Opening checkout…" : "Start Pro monthly"}
      </button>
      <button type="button" className="text-sm font-semibold text-ink-2 underline underline-offset-4 disabled:opacity-50" disabled={busy !== null} onClick={() => buy("pro_yearly")}>
        {busy === "pro_yearly" ? "Opening checkout…" : `Pay yearly ($${PRICES.proYearly})`}
      </button>
      {!loggedIn && <span className="sr-only">You will be asked to create an account first.</span>}
    </div>
  );
}

function PricingInner({ returnTo }: { returnTo: string }) {
  const { buy, state } = useCheckout(returnTo);
  const { user, ready, plan } = useAuth();
  const params = useSearchParams();
  const started = useRef(false);

  // Coming back from sign-up with ?buy=<plan>: continue straight to checkout.
  useEffect(() => {
    const want = params.get("buy") as PaidPlan | null;
    if (!want || started.current || !ready || !user) return;
    if (!["pass", "pro_monthly", "pro_yearly"].includes(want)) return;
    started.current = true;
    void buy(want);
  }, [params, ready, user, buy]);

  const onBuy = (p: PaidPlan) => void buy(p);

  return (
    <div>
      {(state.message || state.error) && (
        <p role="status" className={`mb-6 rounded border px-4 py-3 ${state.error ? "border-pencil text-pencil-dark" : "border-rule-strong bg-ledger text-green-ink"}`}>
          {state.error ?? state.message}
        </p>
      )}
      {plan !== "free" && (
        <p className="mb-6 rounded border border-rule-strong bg-ledger px-4 py-3 text-green-ink">
          You are on {plan === "pro" ? "Pro" : "an Audit Pass"}. Every finding and export is unlocked.{" "}
          <Link href="/app" className="link font-semibold">
            Go to your audits
          </Link>
        </p>
      )}

      {/* Wide screens: one table, plans as columns */}
      <div className="sheet hidden overflow-hidden lg:block">
        <table className="ledger text-[0.9375rem]">
          <thead>
            <tr>
              <th scope="col" className="w-[22%]">
                <span className="sr-only">Feature</span>
              </th>
              {PLANS.map((p) => (
                <th key={p.key} scope="col" className="w-[19.5%] align-bottom">
                  <span className="block text-base text-ink">{p.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="!bg-transparent !text-ink-2 font-normal">
                Price
              </th>
              {PLANS.map((p) => (
                <td key={p.key}>
                  <span className="num block text-[1.75rem] font-bold leading-tight text-ink">{p.price}</span>
                  <span className="block text-sm text-ink-2">{p.unit}</span>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="!bg-transparent !text-ink-2 font-normal">
                Best for
              </th>
              {PLANS.map((p) => (
                <td key={p.key} className="text-ink-2">
                  {p.fit}
                </td>
              ))}
            </tr>
            {ROWS.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="!bg-transparent !text-ink-2 font-normal whitespace-normal">
                  {r.label}
                </th>
                {PLANS.map((p) => (
                  <td key={p.key}>
                    <Value v={r.values[p.key]} />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="!border-b-0" />
              {PLANS.map((p) => (
                <td key={p.key} className="!border-b-0 py-4 align-top">
                  <Actions plan={p.key} buy={onBuy} busy={state.busy} loggedIn={Boolean(user)} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Narrow screens: one block per plan */}
      <div className="grid gap-6 sm:grid-cols-2 lg:hidden">
        {PLANS.map((p) => (
          <section key={p.key} className="sheet p-5" aria-labelledby={`plan-${p.key}`}>
            <h3 id={`plan-${p.key}`} className="h3">
              {p.name}
            </h3>
            <p className="mt-2">
              <span className="num text-[1.75rem] font-bold">{p.price}</span> <span className="text-sm text-ink-2">{p.unit}</span>
            </p>
            <p className="mt-2 text-ink-2">{p.fit}</p>
            <ul className="mt-4 grid gap-2 border-t border-rule pt-4 text-[0.9375rem]">
              {ROWS.map((r) => (
                <li key={r.label} className="flex items-start justify-between gap-4">
                  <span className="text-ink-2">{r.label}</span>
                  <span className="shrink-0 text-right font-semibold">
                    <Value v={r.values[p.key]} />
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <Actions plan={p.key} buy={onBuy} busy={state.busy} loggedIn={Boolean(user)} />
            </div>
          </section>
        ))}
      </div>
      <p className="mt-5 text-sm text-ink-2">
        Prices in US dollars. Checkout may show your local currency and adds sales tax or VAT where it applies. Full refund within 14 days of
        your first purchase.
      </p>
    </div>
  );
}

export function PricingTable({ returnTo = "/pricing" }: { returnTo?: string }) {
  return (
    <Suspense fallback={null}>
      <PricingInner returnTo={returnTo} />
    </Suspense>
  );
}
