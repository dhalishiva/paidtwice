"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { callFunction, getSupabase } from "@/lib/supabase";
import { dateTime } from "@/lib/format";
import { useAuth } from "./auth-provider";
import { RequireAuth, planLabel } from "./require-auth";

function Inner() {
  const router = useRouter();
  const { user, session, plan, entitlement, signOut } = useAuth();
  const [profile, setProfile] = useState({ full_name: "", company: "", country: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    sb.from("profiles")
      .select("full_name, company, country")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile({ full_name: data.full_name ?? "", company: data.company ?? "", country: data.country ?? "" });
      });
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !user) return;
    setStatus("Saving…");
    const { error } = await sb
      .from("profiles")
      .update({ full_name: profile.full_name || null, company: profile.company || null, country: profile.country || null })
      .eq("id", user.id);
    setStatus(error ? "Not saved. Try again." : "Saved");
  };

  const subscribed = plan === "pro" && entitlement?.paddle_subscription_id && entitlement.pro_status !== "canceled";

  const remove = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await callFunction("delete-account", { confirm }, session?.access_token);
      await signOut();
      router.replace("/");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "The account could not be deleted.");
      setDeleting(false);
    }
  };

  const until = plan === "pro" ? entitlement?.pro_until : entitlement?.pass_until;

  return (
    <div className="wrap py-12 sm:py-14">
      <h1 className="h2">Account</h1>
      <p className="mt-2 text-ink-2">Signed in as {user?.email}</p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="plan-title" className="sheet p-5 sm:p-6">
          <h2 id="plan-title" className="h3">
            Plan
          </h2>
          <p className="mt-3 text-lg font-bold">{planLabel(plan)}</p>
          <p className="mt-1 text-ink-2">
            {plan === "free" && "Scans show the total at stake and the top three findings."}
            {plan === "pass" && `Full access until ${dateTime(until)}. The pass does not renew.`}
            {plan === "pro" && `Full access, paid through ${dateTime(until)}.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {plan !== "pro" && (
              <Link href="/pricing" className="btn btn-primary btn-sm">
                {plan === "free" ? "See plans" : "Switch to Pro"}
              </Link>
            )}
            {plan === "pro" && (
              <a href="https://paddle.net" className="btn btn-quiet btn-sm" target="_blank" rel="noopener noreferrer">
                Manage subscription
              </a>
            )}
          </div>
          {plan === "pro" && (
            <p className="mt-4 text-sm text-ink-2">
              Payments are handled by Paddle. Use the link in your receipt email, or paddle.net, to update your card, get invoices or cancel.
            </p>
          )}
        </section>

        <section aria-labelledby="profile-title" className="sheet p-5 sm:p-6">
          <h2 id="profile-title" className="h3">
            Your details
          </h2>
          <form onSubmit={save} className="mt-4 grid gap-4">
            <label className="field">
              <span className="label">Name</span>
              <input className="input" value={profile.full_name} maxLength={200} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Company</span>
              <input className="input" value={profile.company} maxLength={200} onChange={(e) => setProfile({ ...profile, company: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Country</span>
              <input className="input" value={profile.country} maxLength={100} onChange={(e) => setProfile({ ...profile, country: e.target.value })} />
            </label>
            <div className="flex items-center gap-4">
              <button type="submit" className="btn btn-primary btn-sm">
                Save details
              </button>
              <span className="text-sm text-ink-2" aria-live="polite">
                {status}
              </span>
            </div>
          </form>
        </section>
      </div>

      <section aria-labelledby="danger-title" className="mt-12 max-w-2xl border-t border-rule pt-8">
        <h2 id="danger-title" className="h3">
          Sign out or delete your account
        </h2>
        <button
          type="button"
          className="btn btn-quiet btn-sm mt-4"
          onClick={() => void signOut().then(() => router.replace("/"))}
        >
          Sign out
        </button>
        <div className="mt-8">
          <p className="text-ink-2">
            Deleting your account removes your profile and every saved audit. Payment records stay with Paddle.
            {subscribed && " Cancel your Pro subscription first, so you are not charged again."}
          </p>
          <label className="field mt-4 max-w-xs">
            <span className="label">Type DELETE to confirm</span>
            <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          {deleteError && (
            <p role="alert" className="error-text mt-3">
              {deleteError}
            </p>
          )}
          <button
            type="button"
            className="btn btn-sm mt-4 border-pencil bg-pencil text-white hover:bg-pencil-dark"
            disabled={confirm !== "DELETE" || deleting}
            onClick={remove}
          >
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function Account() {
  return (
    <RequireAuth>
      <Inner />
    </RequireAuth>
  );
}
