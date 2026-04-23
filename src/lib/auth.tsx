"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { rpcLogin, rpcSignup, type DbUser } from "./db";

const SESSION_KEY = "pokemon-tcg-sim:session:v1";

interface AuthContextValue {
  user: DbUser | null;
  isLoading: boolean;
  login: (loginId: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (
    loginId: string,
    password: string,
    age: number
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<DbUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DbUser;
        if (parsed?.id && parsed?.user_id) setUser(parsed);
      }
    } catch {
      // ignore
    }
    setIsLoading(false);
  }, []);

  const persist = useCallback((u: DbUser | null) => {
    setUser(u);
    try {
      if (u) window.localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }, []);

  const login = useCallback(
    async (loginId: string, password: string) => {
      const res = await rpcLogin(loginId, password);
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error ?? "로그인 실패" };
      }
      persist(res.user);
      return { ok: true };
    },
    [persist]
  );

  const signup = useCallback(
    async (loginId: string, password: string, age: number) => {
      const res = await rpcSignup(loginId, password, age);
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error ?? "회원가입 실패" };
      }
      persist(res.user);
      return { ok: true };
    },
    [persist]
  );

  const logout = useCallback(() => {
    persist(null);
    router.push("/login");
  }, [persist, router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, signup, logout }),
    [user, isLoading, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Client-side guard: redirects to /login when unauthenticated. */
export function useRequireAuth(): DbUser | null {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [user, isLoading, router]);
  return user;
}
