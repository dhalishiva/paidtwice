"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { callFunction } from "@/lib/supabase";
import { useAuth } from "./auth-provider";

const TOPICS: Record<string, string> = {
  "audit-pass": "Buy an Audit Pass",
  pro: "Start Pro",
  "pro-yearly": "Pro, paid yearly",
  firm: "Firm plan for several clients or entities",
  invoice: "Pay by invoice",
  account: "Help with my account",
  security: "Security or data question",
  question: "Something else",
};

const PAID_TOPICS = new Set(["audit-pass", "pro", "pro-yearly"]);

function Inner() {
  const params = useSearchParams();
  const { user, session } = useAuth();
  const initialTopic = params.get("topic") ?? "question";
  const [form, setForm] = useState({
    name: "",
    email: user?.email ?? "",
    company: "",
    country: "",
    topic: TOPICS[initialTopic] ? initialTopic : "question",
    message: "",
    website: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await callFunction(
        "lead",
        { ...form, email: form.email || user?.email || "", topic: TOPICS[form.topic] ?? form.topic, source: `contact:${form.topic}` },
        session?.access_token,
      );
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your message could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div role="status" className="sheet p-6">
        <h2 className="h3">Thanks, we have your message</h2>
        <p className="mt-2 text-ink-2">We reply within one working day, usually sooner. Look out for an email from us.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="sheet grid gap-5 p-5 sm:p-7">
      {PAID_TOPICS.has(initialTopic) && (
        <p className="rounded border border-rule-strong bg-ledger px-4 py-3 text-green-ink">
          Online checkout is being switched on. Leave your details and we will send you a secure payment link, usually the same day.
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="field">
          <span className="label">Your name</span>
          <input className="input" autoComplete="name" value={form.name} onChange={set("name")} />
        </label>
        <label className="field">
          <span className="label">Work email</span>
          <input className="input" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
        </label>
        <label className="field">
          <span className="label">Company</span>
          <input className="input" autoComplete="organization" value={form.company} onChange={set("company")} />
        </label>
        <label className="field">
          <span className="label">Country</span>
          <input className="input" autoComplete="country-name" value={form.country} onChange={set("country")} />
        </label>
      </div>
      <label className="field">
        <span className="label">What is it about?</span>
        <select className="select" value={form.topic} onChange={set("topic")}>
          {Object.entries(TOPICS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Message</span>
        <textarea className="textarea" maxLength={5000} value={form.message} onChange={set("message")} placeholder="Number of entities or clients, the accounting system you use, anything we should know." />
      </label>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
        </label>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}

export function ContactForm() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
