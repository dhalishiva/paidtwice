"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { isPrivatePath } from "@/lib/private-routes";

// The Supabase client (about 60 KB compressed) is loaded only when it can matter: on private
// pages (sign-in, app, account, pay), for auth links, or when this browser holds a saved session.
// Anonymous visitors on public pages never download it.
let clientPromise: Promise<SupabaseClient | null> | null = null;
function loadSupabase(): Promise<SupabaseClient | null> {
  if (!clientPromise) clientPromise = import("@/lib/supabase").then((m) => m.getSupabase());
  return clientPromise;
}
const STORAGE_KEY = "paidtwice-auth"; // must match storageKey in lib/supabase.ts
function hasStoredSession(): boolean {
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return true; // storage blocked: load the client and let it decide
  }
}
function needsAuthNow(pathname: string): boolean {
  return (
    isPrivatePath(pathname) ||
    hasStoredSession() ||
    /access_token|type=recovery|code=/.test(window.location.hash + window.location.search)
  );
}

export type Plan = "free" | "pass" | "pro";

export interface Entitlement {
  pass_until: string | null;
  pro_until: string | null;
  pro_status: string | null;
  pro_cancel_at: string | null;
  paddle_subscription_id: string | null;
  paddle_customer_id: string | null;
}

interface AuthState {
  /** False until the stored session has been read. */
  ready: boolean;
  session: Session | null;
  user: User | null;
  plan: Plan;
  entitlement: Entitlement | null;
  /** Re-reads the plan; returns the fresh value. */
  refreshPlan: () => Promise<Plan>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  ready: false,
  session: null,
  user: null,
  plan: "free",
  entitlement: null,
  refreshPlan: async () => "free",
  signOut: async () => {},
});

export function planOf(e: Entitlement | null): Plan {
  if (!e) return "free";
  const now = Date.now();
  if (e.pro_until && new Date(e.pro_until).getTime() > now) return "pro";
  if (e.pass_until && new Date(e.pass_until).getTime() > now) return "pass";
  return "free";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  const pathname = usePathname() ?? "/";
  const started = useRef(false);
  const unsubscribe = useRef<() => void>(() => {});

  // Start the client the first time it is needed; client-side navigation into a private page
  // (for example clicking Sign in) starts it too.
  useEffect(() => {
    if (started.current) return;
    if (!needsAuthNow(pathname)) {
      setReady(true); // anonymous visitor on a public page: no session to look up
      return;
    }
    started.current = true;
    loadSupabase().then((sb) => {
      if (!sb) {
        setReady(true);
        return;
      }
      sb.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setReady(true);
      });
      const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
        setSession(s);
      });
      unsubscribe.current = () => sub.subscription.unsubscribe();
    });
  }, [pathname]);

  useEffect(() => () => unsubscribe.current(), []);

  const userId = session?.user.id ?? null;

  const loadEntitlement = useCallback(async (): Promise<Entitlement | null> => {
    if (!userId) return null;
    const sb = await loadSupabase();
    if (!sb || !userId) return null;
    const { data } = await sb
      .from("entitlements")
      .select("pass_until, pro_until, pro_status, pro_cancel_at, paddle_subscription_id, paddle_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    return (data as Entitlement | null) ?? null;
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setEntitlement(null);
      return;
    }
    loadEntitlement().then((e) => {
      if (active) setEntitlement(e);
    });
    return () => {
      active = false;
    };
  }, [userId, loadEntitlement]);

  const refreshPlan = useCallback(async () => {
    const e = await loadEntitlement();
    setEntitlement(e);
    return planOf(e);
  }, [loadEntitlement]);

  const signOut = useCallback(async () => {
    const sb = await loadSupabase();
    if (sb) await sb.auth.signOut();
    setSession(null);
    setEntitlement(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      plan: planOf(entitlement),
      entitlement,
      refreshPlan,
      signOut,
    }),
    [ready, session, entitlement, refreshPlan, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
