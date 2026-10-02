// Paddle Billing logic: signature verification and the mapping from events to account changes.
import { describe, expect, it } from "vitest";
import { hmacHex, planEvent, verifyPaddleSignature, type BillingConfig } from "../supabase/functions/_shared/paddle";

const cfg: BillingConfig = { pricePass: "pri_pass", priceProMonthly: "pri_pro_m", priceProYearly: "pri_pro_y", passDays: 30, graceDays: 3 };

describe("signature", () => {
  const secret = "pdl_ntfset_test_secret";
  const body = JSON.stringify({ event_id: "evt_1", event_type: "transaction.completed" });

  it("accepts a valid signature, including during secret rotation", async () => {
    const ts = "1759370000";
    const h1 = await hmacHex(secret, `${ts}:${body}`);
    expect(await verifyPaddleSignature(`ts=${ts};h1=${h1}`, body, secret, 1759370010)).toBe(true);
    expect(await verifyPaddleSignature(`ts=${ts};h1=deadbeef;h1=${h1}`, body, secret, 1759370010)).toBe(true);
  });

  it("rejects a wrong secret, a changed body, an old timestamp and junk", async () => {
    const ts = "1759370000";
    const h1 = await hmacHex(secret, `${ts}:${body}`);
    expect(await verifyPaddleSignature(`ts=${ts};h1=${h1}`, body, "other", 1759370010)).toBe(false);
    expect(await verifyPaddleSignature(`ts=${ts};h1=${h1}`, `${body} `, secret, 1759370010)).toBe(false);
    expect(await verifyPaddleSignature(`ts=${ts};h1=${h1}`, body, secret, 1759379999)).toBe(false);
    expect(await verifyPaddleSignature(null, body, secret)).toBe(false);
    expect(await verifyPaddleSignature("h1=abc", body, secret)).toBe(false);
  });
});

describe("events", () => {
  it("an Audit Pass purchase grants once per transaction", () => {
    const a = planEvent(
      { event_type: "transaction.completed", data: { id: "txn_1", customer_id: "ctm_1", items: [{ price: { id: "pri_pass" } }] } },
      cfg,
    );
    expect(a).toEqual({ kind: "grant_pass", transactionId: "txn_1", days: 30, customerId: "ctm_1" });
    // transaction.paid is deliberately ignored, so a buyer never gets 60 days.
    expect(planEvent({ event_type: "transaction.paid", data: { id: "txn_1", items: [{ price: { id: "pri_pass" } }] } }, cfg)).toEqual({ kind: "record" });
  });

  it("price custom data can name the plan instead of env price ids", () => {
    const a = planEvent(
      { event_type: "transaction.completed", data: { id: "txn_2", items: [{ price: { id: "pri_x", custom_data: { plan: "pass", days: 60 } } }] } },
      { passDays: 30, graceDays: 3 },
    );
    expect(a).toMatchObject({ kind: "grant_pass", days: 60 });
  });

  it("subscription events mirror Pro, with grace, scheduled cancellations and ends", () => {
    const active = planEvent(
      {
        event_type: "subscription.updated",
        occurred_at: "2026-10-02T10:00:00Z",
        data: {
          id: "sub_1",
          status: "active",
          customer_id: "ctm_1",
          items: [{ price: { id: "pri_pro_m" } }],
          current_billing_period: { ends_at: "2026-11-02T10:00:00Z" },
          scheduled_change: { action: "cancel", effective_at: "2026-11-02T10:00:00Z" },
        },
      },
      cfg,
    );
    expect(active).toEqual({
      kind: "sync_pro",
      subscriptionId: "sub_1",
      customerId: "ctm_1",
      status: "active",
      proUntil: "2026-11-05T10:00:00.000Z",
      cancelAt: "2026-11-02T10:00:00Z",
    });
    const canceled = planEvent(
      { event_type: "subscription.canceled", occurred_at: "2026-11-02T10:00:00Z", data: { id: "sub_1", status: "canceled", items: [{ price: { id: "pri_pro_m" } }], current_billing_period: null } },
      cfg,
    );
    expect(canceled).toMatchObject({ kind: "sync_pro", status: "canceled", proUntil: "2026-11-02T10:00:00Z" });
  });

  it("subscriptions for other products are only recorded", () => {
    expect(planEvent({ event_type: "subscription.created", data: { id: "sub_9", status: "active", items: [{ price: { id: "pri_other" } }] } }, cfg)).toEqual({
      kind: "record",
    });
  });

  it("approved full refunds and chargebacks revoke; partial or pending ones do not", () => {
    const ev = (data: Record<string, unknown>) => planEvent({ event_type: "adjustment.updated", data }, cfg);
    expect(ev({ action: "refund", status: "approved", type: "full", transaction_id: "txn_1" })).toEqual({ kind: "revoke", transactionId: "txn_1", reason: "refund" });
    expect(ev({ action: "chargeback", status: "approved", transaction_id: "txn_1" })).toEqual({ kind: "revoke", transactionId: "txn_1", reason: "chargeback" });
    expect(ev({ action: "refund", status: "pending_approval", type: "full", transaction_id: "txn_1" })).toEqual({ kind: "record" });
    expect(ev({ action: "refund", status: "approved", type: "partial", transaction_id: "txn_1" })).toEqual({ kind: "record" });
    expect(ev({ action: "credit", status: "approved", transaction_id: "txn_1" })).toEqual({ kind: "record" });
  });
});
