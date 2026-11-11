import type { AuthSession, SignInChallenge, TeamSummary, UserSummary } from "@mimorii/contracts";
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
import { api, jsonBody, revokeAuthSession } from "./api";
import {
  getAuthSession,
  loadAuthSession,
  storeAuthSession,
  subscribeAuthSession,
} from "./auth-session";
import { usePrivacy } from "./privacy";
import { revokePushOnLogout } from "./push-notifications";
import { identifySwetrixUser, resetSwetrixUser, trackSwetrixEvent } from "./swetrix";

const TEAM_KEY = "mimorii.team";

interface AuthContextValue {
  session: AuthSession | null;
  profileReady: boolean;
  activeTeam: TeamSummary | null;
  setActiveTeamId: (id: string) => void;
  login: (email: string, password: string) => Promise<SignInChallenge>;
  register: (
    name: string,
    email: string,
    password: string,
    acceptedTerms: boolean
  ) => Promise<SignInChallenge>;
  completeSignIn: (session: AuthSession) => void;
  refreshIdentity: () => Promise<void>;
  acknowledgeTour: (tourId: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { preferences } = usePrivacy();
  const [session, setSession] = useState<AuthSession | null>(loadAuthSession);
  const sessionRef = useRef(session);
  const [profileStatus, setProfileStatus] = useState<"loading" | "ready" | "error">("loading");
  const [activeTeamId, setActiveTeamIdState] = useState(() => localStorage.getItem(TEAM_KEY));

  const storeSession = useCallback((next: AuthSession | null) => {
    sessionRef.current = next;
    setSession(next);
    storeAuthSession(next);
  }, []);

  useEffect(
    () =>
      subscribeAuthSession((next) => {
        sessionRef.current = next;
        setSession(next);
      }),
    []
  );

  const completeSignIn = useCallback(
    (next: AuthSession) => {
      storeSession(next);
      setProfileStatus("ready");
      const teamId = next.teams[0]?.id ?? null;
      if (teamId) {
        localStorage.setItem(TEAM_KEY, teamId);
        setActiveTeamIdState(teamId);
      }
      trackSwetrixEvent({ ev: "ACCOUNT_SIGNED_IN" });
    },
    [storeSession]
  );

  const logout = useCallback(() => {
    const refreshToken = sessionRef.current?.refreshToken;
    revokePushOnLogout();
    if (refreshToken) void revokeAuthSession(refreshToken).catch(() => undefined);
    trackSwetrixEvent({ ev: "ACCOUNT_SIGNED_OUT" });
    resetSwetrixUser();
    storeSession(null);
    setProfileStatus("ready");
    localStorage.removeItem(TEAM_KEY);
    setActiveTeamIdState(null);
  }, [storeSession]);

  const refreshIdentity = useCallback(async () => {
    const requestedSession = getAuthSession();
    if (!requestedSession) {
      setProfileStatus("ready");
      return;
    }
    const identity = await api<{ user: UserSummary; teams: TeamSummary[] }>("/auth/me");
    const currentSession = getAuthSession();
    if (!currentSession || currentSession.user.id !== requestedSession.user.id) return;
    const next = { ...currentSession, ...identity };
    storeSession(next);
    setProfileStatus("ready");
    if (!identity.teams.some((team) => team.id === activeTeamId)) {
      const first = identity.teams[0]?.id ?? null;
      if (first) localStorage.setItem(TEAM_KEY, first);
      setActiveTeamIdState(first);
    }
  }, [activeTeamId, storeSession]);

  const acknowledgeTour = useCallback(
    async (tourId: string) => {
      if (!getAuthSession()) return;
      const user = await api<UserSummary>(
        `/auth/profile/tour-acknowledgements/${encodeURIComponent(tourId)}`,
        { method: "PUT" }
      );
      const activeSession = getAuthSession();
      if (!activeSession || activeSession.user.id !== user.id) return;
      storeSession({ ...activeSession, user });
      setProfileStatus("ready");
    },
    [storeSession]
  );

  const sessionUserId = session?.user.id;
  useEffect(() => {
    if (!sessionUserId) {
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
  }, [profileStatus, refreshIdentity, sessionUserId]);

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
      login: (email, password) =>
        api<SignInChallenge>("/auth/login", { method: "POST", ...jsonBody({ email, password }) }),
      register: async (name, email, password, acceptedTerms) => {
        const challenge = await api<SignInChallenge>("/auth/register", {
          method: "POST",
          ...jsonBody({ name, email, password, acceptedTerms }),
        });
        trackSwetrixEvent({ ev: "ACCOUNT_REGISTERED", unique: true });
        return challenge;
      },
      completeSignIn,
      refreshIdentity,
      acknowledgeTour,
      logout,
    }),
    [acknowledgeTour, activeTeam, completeSignIn, logout, profileStatus, refreshIdentity, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
