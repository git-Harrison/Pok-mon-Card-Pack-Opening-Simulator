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
import {
  fetchMe,
  rpcLogin,
  rpcSignup,
  touchLastSeen,
  type DbUser,
} from "./db";

const SESSION_KEY = "pokemon-tcg-sim:session:v2";

interface AuthContextValue {
  user: DbUser | null;
  isLoading: boolean;
  login: (loginId: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (
    loginId: string,
    password: string,
    age: number,
    displayName: string
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
    // Skip the state update if the new value is value-equal to the current
    // one. The 20s auth ticker would otherwise hand back a fresh object
    // every poll, breaking referential equality on `user` and forcing every
    // page that depends on `[user]` (refresh callbacks, useEffects, etc.)
    // to re-run, even when nothing actually changed.
    setUser((prev) => {
      if (prev === u) return prev;
      if (prev && u) {
        try {
          if (JSON.stringify(prev) === JSON.stringify(u)) return prev;
        } catch {
          // fall through to overwrite
        }
      }
      return u;
    });
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

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    // 진입 즉시 한 번 heartbeat — login / 새로고침 직후 dot 발화 위해.
    void touchLastSeen(userId);
    const tick = async () => {
      if (!alive) return;
      if (typeof document !== "undefined" && document.hidden) return;
      // last_seen_at heartbeat (실시간 presence channel 의 fallback 으로
      // /users 페이지 온라인 dot 의 데이터 소스).
      void touchLastSeen(userId);
      const fresh = await fetchMe(userId);
      if (alive && fresh) persist(fresh);
    };
    // 15s ticker. 이전엔 4초마다 fetchMe → JSON.stringify 비교가 모바일에서
    // 메인 스레드를 자주 흔들어 스크롤이 1회씩 미세하게 끊김. 15초여도
    // 어드민 보상 / 선물 / 야생 승리 반영에 체감 차이는 거의 없고,
    // visibility 변경 시 즉시 tick 하도록 onVis 가 보강해 줘서 충분.
    // realtime 채널 (gift/taunt INSERT) 은 별도로 즉시 알림이 옴.
    const id = setInterval(tick, 15_000);
    const onVis = () => {
      if (typeof document !== "undefined" && !document.hidden) tick();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      alive = false;
      clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, [userId, persist]);

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
    async (
      loginId: string,
      password: string,
      age: number,
      displayName: string
    ) => {
      const res = await rpcSignup(loginId, password, age, displayName);
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error ?? "회원가입 실패" };
      }
      const fresh = await fetchMe(res.user.id);
      persist(
        fresh ?? {
          ...res.user,
          points: 0,
        }
      );
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
