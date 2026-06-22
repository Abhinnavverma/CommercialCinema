import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError } from "../api/client.js";
import { adminLogin, fetchMe, patronLogin, patronSignup, type AuthUser } from "../api/auth.js";

const PATRON_TOKEN_KEY = "apexflo_patron_token";
const PATRON_SESSION_KEY = "apexflo_session_id";
const ADMIN_TOKEN_KEY = "apexflo_admin_token";

type AuthContextValue = {
  patronToken: string | null;
  patronUser: AuthUser | null;
  adminToken: string | null;
  adminUser: AuthUser | null;
  patronLoading: boolean;
  patronError: string | null;
  patronReady: boolean;
  bootstrapPatron: () => Promise<void>;
  loginAdmin: (email: string, password: string) => Promise<void>;
  logoutAdmin: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(PATRON_SESSION_KEY);
  if (existing) {
    return existing;
  }
  const sessionId = crypto.randomUUID();
  localStorage.setItem(PATRON_SESSION_KEY, sessionId);
  return sessionId;
}

async function signupOrLogin(sessionId: string): Promise<{ token: string; user: AuthUser }> {
  try {
    return await patronSignup(sessionId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return await patronLogin(sessionId);
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [patronToken, setPatronToken] = useState<string | null>(
    () => localStorage.getItem(PATRON_TOKEN_KEY),
  );
  const [patronUser, setPatronUser] = useState<AuthUser | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(
    () => localStorage.getItem(ADMIN_TOKEN_KEY),
  );
  const [adminUser, setAdminUser] = useState<AuthUser | null>(null);
  const [patronLoading, setPatronLoading] = useState(true);
  const [patronError, setPatronError] = useState<string | null>(null);
  const [patronReady, setPatronReady] = useState(false);

  const bootstrapPatron = useCallback(async () => {
    setPatronLoading(true);
    setPatronError(null);

    try {
      const storedToken = localStorage.getItem(PATRON_TOKEN_KEY);

      if (storedToken) {
        try {
          const me = await fetchMe(storedToken);
          setPatronToken(storedToken);
          setPatronUser(me.user);
          setPatronReady(true);
          return;
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            localStorage.removeItem(PATRON_TOKEN_KEY);
            setPatronToken(null);
            setPatronUser(null);
          } else {
            throw error;
          }
        }
      }

      const sessionId = getOrCreateSessionId();
      const response = await signupOrLogin(sessionId);
      localStorage.setItem(PATRON_TOKEN_KEY, response.token);
      setPatronToken(response.token);
      setPatronUser(response.user);
      setPatronReady(true);
    } catch (error) {
      setPatronError(error instanceof Error ? error.message : "Failed to authenticate patron");
      setPatronReady(false);
    } finally {
      setPatronLoading(false);
    }
  }, []);

  const loginAdmin = useCallback(async (email: string, password: string) => {
    const response = await adminLogin(email, password);
    localStorage.setItem(ADMIN_TOKEN_KEY, response.token);
    setAdminToken(response.token);
    setAdminUser(response.user);
  }, []);

  const logoutAdmin = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken(null);
    setAdminUser(null);
  }, []);

  useEffect(() => {
    void bootstrapPatron();
  }, [bootstrapPatron]);

  useEffect(() => {
    if (adminToken) {
      setAdminUser({ id: "admin", role: "admin" });
    }
  }, [adminToken]);

  const value = useMemo(
    () => ({
      patronToken,
      patronUser,
      adminToken,
      adminUser,
      patronLoading,
      patronError,
      patronReady,
      bootstrapPatron,
      loginAdmin,
      logoutAdmin,
    }),
    [
      patronToken,
      patronUser,
      adminToken,
      adminUser,
      patronLoading,
      patronError,
      patronReady,
      bootstrapPatron,
      loginAdmin,
      logoutAdmin,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
