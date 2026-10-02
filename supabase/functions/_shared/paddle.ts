// Pure Paddle Billing logic shared by the webhook and the tests. No Deno or Node APIs beyond
// Web Crypto, so the same file runs in Supabase Edge Functions and in Vitest.
//
// Paddle docs: https://developer.paddle.com/webhooks/signature-verification
//              https://developer.paddle.com/webhooks/respond-to-webhooks

export type PaddleObject = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies a `Paddle-Signature: ts=...;h1=...` header: HMAC-SHA256 of `${ts}:${rawBody}` with the
 * notification destination's secret key. Several h1 values appear while a secret is rotated; any
 * match is accepted. Replays are also blocked by event-id idempotency in the database.
 */
export async function verifyPaddleSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  nowSec = Date.now() / 1000,
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts: Record<string, string[]> = {};
  for (const piece of header.split(";")) {
    const eq = piece.indexOf("=");
    if (eq < 1) continue;
    const k = piece.slice(0, eq).trim();
    const v = piece.slice(eq + 1).trim();
    if (v) (parts[k] ??= []).push(v);
  }
  const ts = parts.ts?.[0];
  const sigs = parts.h1 ?? [];
  if (!ts || !/^\d+$/.test(ts) || !sigs.length) return false;
  if (Math.abs(nowSec - Number(ts)) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${ts}:${rawBody}`);
  return sigs.some((s) => timingSafeEqual(s, expected));
}

export interface BillingConfig {
  pricePass?: string;
  priceProMonthly?: string;
  priceProYearly?: string;
  passDays: number;
  graceDays: number;
}

export type BillingAction =
  | { kind: "record" }
  | { kind: "grant_pass"; transactionId: string; days: number; customerId: string | null }
  | {
      kind: "pro_payment";
      transactionId: string;
      subscriptionId: string | null;
      customerId: string | null;
      /** Paid-through date plus grace, only ever used to extend access. */
      paidThrough: string | null;
    }
  | {
      kind: "sync_pro";
      subscriptionId: string;
      customerId: string | null;
      status: string;
      proUntil: string | null;
      cancelAt: string | null;
    }
  | { kind: "revoke"; transactionId: string; reason: "refund" | "chargeback" };

const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

function itemPlans(data: PaddleObject, cfg: BillingConfig): { pass: boolean; pro: boolean; passDays: number } {
  let pass = false;
  let pro = false;
  let passDays = cfg.passDays;
  for (const it of (data.items ?? []) as PaddleObject[]) {
    const price = it?.price ?? {};
    const id = price.id ?? it?.price_id;
    const planTag = String(price.custom_data?.plan ?? "").toLowerCase();
    if (planTag === "pass" || (id && id === cfg.pricePass)) {
      pass = true;
      const d = Number(price.custom_data?.days);
      if (Number.isFinite(d) && d > 0 && d <= 3660) passDays = d;
    }
    if (planTag === "pro" || (id && (id === cfg.priceProMonthly || id === cfg.priceProYearly))) pro = true;
  }
  return { pass, pro, passDays };
}

/**
 * Turns one verified Paddle event into the single change it should make. Transactions grant the
 * one-off Audit Pass (once per transaction id); subscription events mirror the Pro subscription;
 * approved full refunds and chargebacks take access back.
 */
export function planEvent(event: PaddleObject, cfg: BillingConfig): BillingAction {
  const type = String(event?.event_type ?? "");
  const data: PaddleObject = event?.data ?? {};

  if (type === "transaction.completed") {
    const { pass, pro, passDays } = itemPlans(data, cfg);
    if (pass && !data.subscription_id && data.id) {
      return { kind: "grant_pass", transactionId: String(data.id), days: passDays, customerId: data.customer_id ?? null };
    }
    if (pro && data.id) {
      const end = data.billing_period?.ends_at;
      return {
        kind: "pro_payment",
        transactionId: String(data.id),
        subscriptionId: data.subscription_id ?? null,
        customerId: data.customer_id ?? null,
        paidThrough: end ? addDays(end, cfg.graceDays) : null,
      };
    }
    return { kind: "record" };
  }

  if (type.startsWith("subscription.")) {
    const { pro } = itemPlans(data, cfg);
    if (!pro || !data.id) return { kind: "record" };
    const status = String(data.status ?? "");
    const end = data.current_billing_period?.ends_at as string | undefined;
    let proUntil: string | null = null;
    if ((status === "active" || status === "trialing" || status === "past_due") && end) {
      proUntil = addDays(end, cfg.graceDays);
    } else if (status === "canceled" || status === "paused") {
      proUntil = String(event.occurred_at ?? new Date().toISOString());
    }
    const sc = data.scheduled_change;
    const cancelAt = sc && sc.action === "cancel" && sc.effective_at ? String(sc.effective_at) : null;
    return {
      kind: "sync_pro",
      subscriptionId: String(data.id),
      customerId: data.customer_id ?? null,
      status,
      proUntil,
      cancelAt,
    };
  }

  if (type === "adjustment.created" || type === "adjustment.updated") {
    const action = String(data.action ?? "");
    const approved = String(data.status ?? "") === "approved";
    if (!data.transaction_id || !approved) return { kind: "record" };
    if (action === "chargeback") return { kind: "revoke", transactionId: String(data.transaction_id), reason: "chargeback" };
    if (action === "refund" && String(data.type ?? "full") === "full") {
      return { kind: "revoke", transactionId: String(data.transaction_id), reason: "refund" };
    }
    return { kind: "record" };
  }

  return { kind: "record" };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The user id we passed to checkout as custom data, when it survived to this event. */
export function customUserId(data: PaddleObject): string | null {
  const v = data?.custom_data?.user_id;
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}
