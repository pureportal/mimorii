import type { AuthSession, TeamSummary, UserSummary } from "@mimorii/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, jsonBody, setAccessToken } from "./api";
import { usePrivacy } from "./privacy";
import { revokePushOnLogout } from "./push-notifications";
import { identifySwetrixUser, resetSwetrixUser, trackSwetrixEvent } from "./swetrix";

const SESSION_KEY = "mimorii.session";
const TEAM_KEY = "mimorii.team";
const teamRoles = new Set(["owner", "admin", "member", "viewer"]);

interface AuthContextValue {
  session: AuthSession | null;
  profileReady: boolean;
  activeTeam: TeamSummary | null;
  setActiveTeamId: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    acceptedTerms: boolean
  ) => Promise<void>;
  refreshIdentity: () => Promise<void>;
  acknowledgeTour: (tourId: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): AuthSession | null {
  localStorage.removeItem("mimorii.token");
  try {
    const value = localStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session: unknown = JSON.parse(value);
    if (!isAuthSession(session)) throw new Error("Stored session is invalid");
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TEAM_KEY);
      setAccessToken(null);
      return null;
    }
    setAccessToken(session.accessToken);
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TEAM_KEY);
    setAccessToken(null);
    return null;
  }
}

function isAuthSession(value: unknown): value is AuthSession {
  return (
    isRecord(value) &&
    typeof value.accessToken === "string" &&
    typeof value.expiresAt === "string" &&
    isUserSummary(value.user) &&
    Array.isArray(value.teams) &&
    value.teams.every(isTeamSummary)
  );
}

function isUserSummary(value: unknown): value is UserSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.name === "string" &&
    typeof value.isGlobalAdmin === "boolean" &&
    Array.isArray(value.acknowledgedTourIds) &&
    value.acknowledgedTourIds.every((tourId) => typeof tourId === "string") &&
    typeof value.createdAt === "string"
  );
}

function isTeamSummary(value: unknown): value is TeamSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    typeof value.role === "string" &&
    teamRoles.has(value.role) &&
    typeof value.createdAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { preferences } = usePrivacy();
  const [session, setSession] = useState<AuthSession | null>(readSession);
  const sessionRef = useRef(session);
  const [profileStatus, setProfileStatus] = useState<"loading" | "ready" | "error">("loading");
  const [activeTeamId, setActiveTeamIdState] = useState(() => localStorage.getItem(TEAM_KEY));

  const storeSession = useCallback((next: AuthSession | null) => {
    sessionRef.current = next;
    setSession(next);
    setAccessToken(next?.accessToken ?? null);
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  }, []);

  const authenticate = useCallback(
    async (path: string, payload: Record<string, string | boolean>) => {
      const next = await api<AuthSession>(path, { method: "POST", ...jsonBody(payload) });
      storeSession(next);
      setProfileStatus("ready");
      const teamId = next.teams[0]?.id ?? null;
      if (teamId) {
        localStorage.setItem(TEAM_KEY, teamId);
        setActiveTeamIdState(teamId);
      }
      const registered = path.endsWith("/register");
      trackSwetrixEvent({
        ev: registered ? "ACCOUNT_REGISTERED" : "ACCOUNT_SIGNED_IN",
        unique: registered,
      });
    },
    [storeSession]
  );

  const logout = useCallback(() => {
    revokePushOnLogout();
    trackSwetrixEvent({ ev: "ACCOUNT_SIGNED_OUT" });
    resetSwetrixUser();
    storeSession(null);
    setProfileStatus("ready");
    localStorage.removeItem(TEAM_KEY);
    setActiveTeamIdState(null);
  }, [storeSession]);

  const refreshIdentity = useCallback(async () => {
    if (!session) {
      setProfileStatus("ready");
      return;
    }
    const requestedSession = session;
    const identity = await api<{ user: UserSummary; teams: TeamSummary[] }>("/auth/me");
    if (sessionRef.current?.accessToken !== requestedSession.accessToken) return;
    const next = { ...requestedSession, ...identity };
    storeSession(next);
    setProfileStatus("ready");
    if (!identity.teams.some((team) => team.id === activeTeamId)) {
      const first = identity.teams[0]?.id ?? null;
      if (first) localStorage.setItem(TEAM_KEY, first);
      setActiveTeamIdState(first);
    }
  }, [activeTeamId, session, storeSession]);

  const acknowledgeTour = useCallback(
    async (tourId: string) => {
      if (!session) return;
      const user = await api<UserSummary>(
        `/auth/profile/tour-acknowledgements/${encodeURIComponent(tourId)}`,
        { method: "PUT" }
      );
      setSession((current) => {
        if (!current || current.user.id !== user.id) return current;
        const next = { ...current, user };
        sessionRef.current = next;
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        return next;
      });
      setProfileStatus("ready");
    },
    [session]
  );

  useEffect(() => {
    if (!session) {
      setProfileStatus("ready");
      return undefined;
    }
    if (profileStatus !== "loading") return undefined;
    let active = true;
    void refreshIdentity().catch(() => {
      if (active) setProfileStatus("error");
    });
    return () => {
      active = false;
    };
  }, [profileStatus, refreshIdentity, session]);

  useEffect(() => {
    window.addEventListener("mimorii:unauthorized", logout);
    return () => window.removeEventListener("mimorii:unauthorized", logout);
  }, [logout]);

  const activeTeam =
    session?.teams.find((team) => team.id === activeTeamId) ?? session?.teams[0] ?? null;

  useEffect(() => {
    if (!session) {
      resetSwetrixUser();
      return;
    }
    identifySwetrixUser(session.user.id, activeTeam ? { team_role: activeTeam.role } : undefined);
  }, [activeTeam, preferences?.analytics, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profileReady: profileStatus === "ready",
      activeTeam,
      setActiveTeamId: (id) => {
        localStorage.setItem(TEAM_KEY, id);
        setActiveTeamIdState(id);
      },
      login: (email, password) => authenticate("/auth/login", { email, password }),
      register: (name, email, password, acceptedTerms) =>
        authenticate("/auth/register", { name, email, password, acceptedTerms }),
      refreshIdentity,
      acknowledgeTour,
      logout,
    }),
    [acknowledgeTour, activeTeam, authenticate, logout, profileStatus, refreshIdentity, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
