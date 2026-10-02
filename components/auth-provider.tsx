"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

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

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setReady(true);
      return;
    }
    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  const loadEntitlement = useCallback(async (): Promise<Entitlement | null> => {
    const sb = getSupabase();
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
    const sb = getSupabase();
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
