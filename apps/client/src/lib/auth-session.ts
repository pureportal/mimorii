import type { AuthSession, TeamSummary, UserSummary } from "@mimorii/contracts";

const SESSION_KEY = "mimorii.session";
const TEAM_KEY = "mimorii.team";
const teamRoles = new Set(["owner", "admin", "member", "viewer"]);
const listeners = new Set<(session: AuthSession | null) => void>();
let currentSession: AuthSession | null = null;
let initialized = false;
let listeningForStorage = false;

export function loadAuthSession(): AuthSession | null {
  currentSession = readStoredSession();
  initialized = true;
  return currentSession;
}

export function getAuthSession(): AuthSession | null {
  return initialized ? currentSession : loadAuthSession();
}

export function storeAuthSession(session: AuthSession | null): void {
  currentSession = session;
  initialized = true;
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    clearStoredSession();
  }
  notifyListeners();
}

export function subscribeAuthSession(listener: (session: AuthSession | null) => void): () => void {
  listeners.add(listener);
  if (!listeningForStorage) {
    window.addEventListener("storage", handleStorage);
    listeningForStorage = true;
  }
  listener(getAuthSession());
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && listeningForStorage) {
      window.removeEventListener("storage", handleStorage);
      listeningForStorage = false;
    }
  };
}

export function isAuthSession(value: unknown): value is AuthSession {
  return (
    isRecord(value) &&
    typeof value.accessToken === "string" &&
    isTimestamp(value.expiresAt) &&
    typeof value.refreshToken === "string" &&
    isTimestamp(value.refreshExpiresAt) &&
    isUserSummary(value.user) &&
    Array.isArray(value.teams) &&
    value.teams.every(isTeamSummary)
  );
}

function readStoredSession(): AuthSession | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session: unknown = JSON.parse(value);
    if (!isAuthSession(session)) throw new Error("Stored session is invalid");
    if (new Date(session.refreshExpiresAt).getTime() <= Date.now()) {
      clearStoredSession();
      return null;
    }
    return session;
  } catch {
    clearStoredSession();
    return null;
  }
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== SESSION_KEY) return;
  currentSession = readStoredSession();
  initialized = true;
  notifyListeners();
}

function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TEAM_KEY);
}

function notifyListeners(): void {
  for (const listener of listeners) listener(currentSession);
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
    isTimestamp(value.createdAt)
  );
}

function isTeamSummary(value: unknown): value is TeamSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.role === "string" &&
    teamRoles.has(value.role) &&
    (value.logoUpdatedAt === undefined ||
      typeof value.logoUpdatedAt === "string" ||
      value.logoUpdatedAt === null) &&
    isTimestamp(value.createdAt)
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
