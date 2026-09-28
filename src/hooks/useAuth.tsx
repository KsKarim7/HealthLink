import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getSessionState,
  login as loginFn,
  logout as logoutFn,
} from "@/lib/auth.server";
import { SIGNED_OUT, type SessionState } from "@/lib/auth";

interface AuthContextValue {
  /** Null until the first session check resolves; never read while isLoading. */
  session: SessionState | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads the server session, e.g. after a call failed as unauthenticated. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Mirrors the real server session, which now answers exactly one question:
 * signed in, or not. Nothing here is persisted client-side — this is a cache of
 * what the server last said, and the server is asked again on every mount.
 *
 * The Phase 0 hydration rule still holds. The server render and the first client
 * render both produce `isLoading: true` with no session, because the session
 * check only starts in an effect — so the two renders agree, and the routes show
 * a neutral loading state instead of redirecting during render.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSession(await getSessionState());
    } catch {
      // A failed check must not strand the app on a spinner; treat it as
      // signed out and let the route send the user to /login.
      setSession(SIGNED_OUT);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (password: string) => {
    // The server sets the httpOnly session cookie; this is only the local echo
    // of what it reported back.
    setSession(await loginFn({ data: { password } }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutFn();
    } finally {
      // Even if the round-trip failed, stop showing a signed-in UI.
      setSession(SIGNED_OUT);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      isAuthenticated: session?.authenticated === true,
      login,
      logout,
      refresh,
    }),
    [session, isLoading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
