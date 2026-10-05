"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { callFunction, getSupabase } from "@/lib/supabase";
import { useAuth } from "./auth-provider";

/** Only same-site relative paths are allowed as a post-login destination. */
export function safeNext(raw: string | null, fallback = "/app"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

function Shell({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="wrap py-14 sm:py-20">
      <div className="mx-auto max-w-md">
        <h1 className="h2">{title}</h1>
        {intro && <div className="mt-3 text-ink-2">{intro}</div>}
        <div className="sheet mt-8 p-5 sm:p-7">{children}</div>
      </div>
    </div>
  );
}

function SignUpInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { user, ready } = useAuth();
  const [form, setForm] = useState({ fullName: "", company: "", email: "", password: "", website: "" });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user && !busy) router.replace(next);
  }, [ready, user, busy, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agree) {
      setError("Please accept the terms of service and privacy policy to continue.");
      return;
    }
    setBusy(true);
    try {
      await callFunction("signup", { ...form, email: form.email.trim() });
      const sb = getSupabase();
      if (!sb) throw new Error("Sign-in is not available right now.");
      const { error: signInError } = await sb.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
      if (signInError) throw new Error(signInError.message);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Shell
      title="Create your account"
      intro={
        <>
          Already have one?{" "}
          <Link className="link font-semibold text-ink" href={`/login?next=${encodeURIComponent(next)}`}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <label className="field">
          <span className="label">Your name</span>
          <input className="input" autoComplete="name" value={form.fullName} onChange={set("fullName")} />
        </label>
        <label className="field">
          <span className="label">Company</span>
          <input className="input" autoComplete="organization" value={form.company} onChange={set("company")} />
        </label>
        <label className="field">
          <span className="label">Work email</span>
          <input className="input" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input className="input" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set("password")} />
          <span className="hint">At least 10 characters.</span>
        </label>
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
          </label>
        </div>
        <label className="flex items-start gap-3 text-[0.9375rem]">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#14213d]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="link" target="_blank">
              terms of service
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy" className="link" target="_blank">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Creating your account…" : "Create account"}
        </button>
      </form>
    </Shell>
  );
}

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { user, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user && !busy) router.replace(next);
  }, [ready, user, busy, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const sb = getSupabase();
    if (!sb) {
      setError("Sign-in is not available right now.");
      setBusy(false);
      return;
    }
    const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setError(/invalid/i.test(err.message) ? "That email and password do not match an account." : err.message);
      setBusy(false);
      return;
    }
    router.replace(next);
  };

  return (
    <Shell
      title="Sign in"
      intro={
        <>
          New to PaidTwice?{" "}
          <Link className="link font-semibold text-ink" href={`/signup?next=${encodeURIComponent(next)}`}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-5">
        <label className="field">
          <span className="label">Email</span>
          <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <Link href="/reset" className="link justify-self-start text-[0.9375rem]">
          Forgot your password?
        </Link>
      </form>
    </Shell>
  );
}

function ResetInner() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = getSupabase();
    const { error: err } = sb
      ? await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset/update` })
      : { error: new Error("Not available") };
    setBusy(false);
    if (err && !/rate|seconds/i.test(err.message)) {
      setError("The reset email could not be sent. Try again in a few minutes, or contact us.");
      return;
    }
    setSent(true);
  };

  return (
    <Shell title="Reset your password" intro="We will email you a link to choose a new password.">
      {sent ? (
        <p role="status">
          If an account exists for <strong>{email}</strong>, a reset link is on its way. It can take a few minutes; check your spam folder too.
          No email after ten minutes?{" "}
          <Link href="/contact?topic=account" className="link">
            Contact us
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={submit} className="grid gap-5">
          <label className="field">
            <span className="label">Email</span>
            <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Sending…" : "Email me a reset link"}
          </button>
        </form>
      )}
    </Shell>
  );
}

function UpdatePasswordInner() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      setError("Use a password of at least 10 characters.");
      return;
    }
    setBusy(true);
    const sb = getSupabase();
    const { error: err } = sb ? await sb.auth.updateUser({ password }) : { error: new Error("Not available") };
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace("/app");
  };

  if (ready && !user) {
    return (
      <Shell title="Choose a new password">
        <p>
          This reset link has expired or was already used.{" "}
          <Link href="/reset" className="link">
            Request a new one
          </Link>
          .
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} className="grid gap-5">
        <label className="field">
          <span className="label">New password</span>
          <input className="input" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="hint">At least 10 characters.</span>
        </label>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !ready}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </Shell>
  );
}

const wrap = (C: React.ComponentType) =>
  function Wrapped() {
    return (
      // These forms read the address (?next=…) so they render after hydration. The placeholder
      // fills the screen so the footer is never in view to jump when the form appears.
      <Suspense fallback={<div className="min-h-dvh" aria-hidden="true" />}>
        <C />
      </Suspense>
    );
  };

export const SignUpForm = wrap(SignUpInner);
export const SignInForm = wrap(SignInInner);
export const ResetForm = wrap(ResetInner);
export const UpdatePasswordForm = wrap(UpdatePasswordInner);
