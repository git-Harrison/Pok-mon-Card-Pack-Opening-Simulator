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
import { fetchMe, rpcLogin, rpcSignup, type DbUser } from "./db";

const SESSION_KEY = "pokemon-tcg-sim:session:v2";

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
  refreshMe: () => Promise<void>;
  setPoints: (points: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadSession(): DbUser | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DbUser;
    if (parsed?.id && parsed?.user_id) return parsed;
  } catch {
    // ignore
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<DbUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const persist = useCallback((u: DbUser | null) => {
    setUser(u);
    try {
      if (u) window.localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Initial session restore + refetch latest points from DB.
  useEffect(() => {
    const stored = loadSession();
    if (stored) {
      setUser(stored);
      fetchMe(stored.id)
        .then((fresh) => {
          if (fresh) persist(fresh);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [persist]);

  const refreshMe = useCallback(async () => {
    if (!user) return;
    const fresh = await fetchMe(user.id);
    if (fresh) persist(fresh);
  }, [user, persist]);

  const setPoints = useCallback(
    (points: number) => {
      if (!user) return;
      persist({ ...user, points });
    },
    [user, persist]
  );

  const login = useCallback(
    async (loginId: string, password: string) => {
      const res = await rpcLogin(loginId, password);
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error ?? "로그인 실패" };
      }
      const fresh = await fetchMe(res.user.id);
      persist(fresh ?? { ...res.user, points: 0 });
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
      const fresh = await fetchMe(res.user.id);
      persist(fresh ?? { ...res.user, points: 0 });
      return { ok: true };
    },
    [persist]
  );

  const logout = useCallback(() => {
    persist(null);
    router.push("/login");
  }, [persist, router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, signup, logout, refreshMe, setPoints }),
    [user, isLoading, login, signup, logout, refreshMe, setPoints]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function useRequireAuth(): DbUser | null {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [user, isLoading, router]);
  return user;
}
