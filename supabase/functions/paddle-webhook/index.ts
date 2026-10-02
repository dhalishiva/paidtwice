// POST /functions/v1/paddle-webhook   (deploy with JWT verification OFF: Paddle signs requests itself)
//
// Receives Paddle Billing notifications, verifies the Paddle-Signature header and keeps
// public.entitlements in sync through public.apply_billing_event(), which stores the event and
// applies it in one transaction (idempotent per event id, ordered per subscription).
//
// Subscribe the notification destination to: transaction.completed, subscription.created,
// subscription.updated, subscription.activated, subscription.canceled, subscription.paused,
// subscription.resumed, subscription.past_due, subscription.trialing, adjustment.created,
// adjustment.updated.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   PADDLE_WEBHOOK_SECRET      the destination's secret key (required)
//   PADDLE_PRICE_PASS          price id of the Audit Pass (or tag the price with custom data {"plan":"pass"})
//   PADDLE_PRICE_PRO_MONTHLY   price id of Pro monthly (or custom data {"plan":"pro"})
//   PADDLE_PRICE_PRO_YEARLY    price id of Pro yearly
//   PADDLE_API_KEY, PADDLE_ENV optional: look up the buyer's email when the event has no user id
import { admin, json } from "../_shared/util.ts";
import { customUserId, planEvent, verifyPaddleSignature, type BillingConfig, type PaddleObject } from "../_shared/paddle.ts";

const config: BillingConfig = {
  pricePass: Deno.env.get("PADDLE_PRICE_PASS") || undefined,
  priceProMonthly: Deno.env.get("PADDLE_PRICE_PRO_MONTHLY") || undefined,
  priceProYearly: Deno.env.get("PADDLE_PRICE_PRO_YEARLY") || undefined,
  passDays: 30,
  graceDays: 3,
};

async function userFromPaddleEmail(db: ReturnType<typeof admin>, customerId: string | undefined): Promise<string | null> {
  const apiKey = Deno.env.get("PADDLE_API_KEY");
  if (!apiKey || !customerId) return null;
  const base = Deno.env.get("PADDLE_ENV") === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  try {
    const res = await fetch(`${base}/customers/${encodeURIComponent(customerId)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return null;
    const email = (await res.json())?.data?.email?.toLowerCase();
    if (!email) return null;
    const { data } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  const secret = Deno.env.get("PADDLE_WEBHOOK_SECRET") ?? "";
  if (!secret) return json({ error: "Billing is not configured yet" }, 503);
  if (!(await verifyPaddleSignature(req.headers.get("Paddle-Signature"), raw, secret))) {
    return json({ error: "Invalid signature" }, 401);
  }

  let event: PaddleObject;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!event?.event_id && !event?.notification_id) return json({ error: "Missing event id" }, 400);

  const data: PaddleObject = event.data ?? {};
  const action = planEvent(event, config);
  const db = admin();
  let userId = customUserId(data);
  if (!userId && action.kind !== "record" && action.kind !== "revoke" && data.customer_id) {
    // The database resolves known Paddle customers itself; for a new one, match the buyer's email
    // (only possible with an API key).
    const { data: known } = await db
      .from("entitlements")
      .select("user_id")
      .eq("paddle_customer_id", String(data.customer_id))
      .limit(1)
      .maybeSingle();
    if (!known) userId = await userFromPaddleEmail(db, data.customer_id);
  }

  const { data: outcome, error } = await db.rpc("apply_billing_event", { p_event: event, p_action: action, p_user_id: userId });
  if (error) {
    // Nothing was stored, so Paddle's retry will apply the event again.
    console.error("apply_billing_event failed", event.event_type, error.message);
    return json({ error: "Could not apply the event" }, 500);
  }
  if (outcome === "no matching account") console.warn("billing event without an account", event.event_type, data.id);
  return json({ ok: true, outcome });
});
