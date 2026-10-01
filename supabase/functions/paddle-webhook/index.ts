// POST /functions/v1/paddle-webhook
// Receives Paddle Billing notifications, verifies the Paddle-Signature header and keeps
// public.entitlements in sync. Configure in Paddle > Developer tools > Notifications with
// events: transaction.completed, subscription.created, subscription.updated,
// subscription.canceled, subscription.paused, subscription.resumed, subscription.past_due.
//
// Secrets: PADDLE_WEBHOOK_SECRET (endpoint secret key), PADDLE_PRICE_PASS,
// PADDLE_PRICE_PRO_MONTHLY, PADDLE_PRICE_PRO_YEARLY, optional PADDLE_API_KEY + PADDLE_ENV
// (to look up the customer's email when custom_data.user_id is missing).
import { admin, json } from "../_shared/util.ts";

const PASS_DAYS = 30;
const GRACE_DAYS = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPaddleSignature(header: string | null, rawBody: string, secret: string, toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.create(null) as Record<string, string[]>;
  for (const piece of header.split(";")) {
    const [k, v] = piece.split("=");
    if (!k || !v) continue;
    (parts[k.trim()] ??= []).push(v.trim());
  }
  const ts = parts.ts?.[0];
  const sigs = parts.h1 ?? [];
  if (!ts || !sigs.length) return false;
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > toleranceSec) return false;
  const expected = await hmacHex(secret, `${ts}:${rawBody}`);
  return sigs.some((s) => timingSafeEqual(s, expected));
}

type Paddle = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function priceIds(data: Paddle): string[] {
  return (data.items ?? []).map((it: Paddle) => it?.price?.id ?? it?.price_id).filter(Boolean);
}

async function resolveUser(db: ReturnType<typeof admin>, data: Paddle): Promise<string | null> {
  const fromCustom = data.custom_data?.user_id;
  if (typeof fromCustom === "string" && UUID_RE.test(fromCustom)) return fromCustom;
  const apiKey = Deno.env.get("PADDLE_API_KEY");
  if (!apiKey || !data.customer_id) return null;
  const base = Deno.env.get("PADDLE_ENV") === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  const res = await fetch(`${base}/customers/${data.customer_id}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) return null;
  const email = (await res.json())?.data?.email?.toLowerCase();
  if (!email) return null;
  const { data: prof } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  return prof?.id ?? null;
}

const addDays = (iso: string | Date, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
const later = (a: string | null | undefined, b: string) => (a && new Date(a) > new Date(b) ? a : b);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  const secret = Deno.env.get("PADDLE_WEBHOOK_SECRET") ?? "";
  if (!secret) return json({ error: "Webhook secret not configured" }, 503);
  if (!(await verifyPaddleSignature(req.headers.get("Paddle-Signature"), raw, secret))) {
    return json({ error: "Invalid signature" }, 401);
  }

  let event: Paddle;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const db = admin();
  const data: Paddle = event.data ?? {};
  const userId = await resolveUser(db, data);

  // Idempotency: Paddle retries; each event_id is applied once.
  const { error: dupErr } = await db.from("billing_events").insert({
    event_id: event.event_id ?? event.notification_id ?? crypto.randomUUID(),
    event_type: event.event_type ?? "unknown",
    occurred_at: event.occurred_at ?? null,
    user_id: userId,
    payload: event,
  });
  if (dupErr) {
    if (dupErr.code === "23505") return json({ ok: true, duplicate: true });
    console.error("billing event insert failed", dupErr.message);
    return json({ error: "storage failed" }, 500);
  }
  if (!userId) {
    console.warn("billing event without a resolvable user", event.event_type, data.id);
    return json({ ok: true, matched: false });
  }

  const PASS = Deno.env.get("PADDLE_PRICE_PASS");
  const PRO = [Deno.env.get("PADDLE_PRICE_PRO_MONTHLY"), Deno.env.get("PADDLE_PRICE_PRO_YEARLY")].filter(Boolean);
  const prices = priceIds(data);
  const { data: current } = await db.from("entitlements").select("*").eq("user_id", userId).maybeSingle();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (data.customer_id) patch.paddle_customer_id = data.customer_id;

  const type: string = event.event_type ?? "";
  if (type === "transaction.completed" || type === "transaction.paid") {
    if (PASS && prices.includes(PASS)) {
      patch.pass_until = addDays(later(current?.pass_until, now), PASS_DAYS);
    }
    if (prices.some((p) => PRO.includes(p)) && data.billing_period?.ends_at) {
      patch.pro_until = later(current?.pro_until, addDays(data.billing_period.ends_at, GRACE_DAYS));
      patch.pro_status = "active";
      if (data.subscription_id) patch.paddle_subscription_id = data.subscription_id;
    }
  } else if (type.startsWith("subscription.")) {
    if (prices.length && !prices.some((p) => PRO.includes(p))) return json({ ok: true, ignored: "not a Pro price" });
    const status: string = data.status ?? "";
    patch.pro_status = status;
    patch.paddle_subscription_id = data.id;
    if (status === "active" || status === "trialing" || status === "past_due") {
      const end = data.current_billing_period?.ends_at;
      if (end) patch.pro_until = addDays(end, GRACE_DAYS);
    } else if (status === "canceled" || status === "paused") {
      patch.pro_until = now;
    }
  } else {
    return json({ ok: true, ignored: type });
  }

  const { error } = await db.from("entitlements").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) {
    console.error("entitlement update failed", error.message);
    return json({ error: "update failed" }, 500);
  }
  return json({ ok: true });
});
