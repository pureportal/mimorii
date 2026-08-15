import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useLocation } from "react-router-dom";
import {
  PRIVACY_PREFERENCES_KEY,
  analyticsConfigured,
  readPrivacyPreferences,
  sessionReplayConfigured,
  storePrivacyPreferences,
  type PrivacyPreferences,
  type PrivacyPreferenceSelection,
} from "./privacy-preferences";
import {
  initializeSwetrix,
  startSwetrixSessionReplay,
  stopSwetrixSessionReplay,
  stopSwetrixTracking,
} from "./swetrix";

interface PrivacyContextValue {
  preferences: PrivacyPreferences | null;
  analyticsConfigured: boolean;
  sessionReplayConfigured: boolean;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  savePreferences: (selection: PrivacyPreferenceSelection) => void;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [preferences, setPreferences] = useState(readPrivacyPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const savePreferences = useCallback((selection: PrivacyPreferenceSelection) => {
    const next = storePrivacyPreferences(selection);
    if (!next.analytics) stopSwetrixTracking();
    else if (!next.sessionReplay) void stopSwetrixSessionReplay();
    setPreferences(next);
  }, []);

  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key === PRIVACY_PREFERENCES_KEY) setPreferences(readPrivacyPreferences());
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  useLayoutEffect(() => {
    if (!preferences?.analytics) {
      stopSwetrixTracking();
      return;
    }
    initializeSwetrix();
    if (preferences.sessionReplay) void startSwetrixSessionReplay();
    else void stopSwetrixSessionReplay();
  }, [location.hash, location.pathname, location.search, preferences]);

  const value = useMemo<PrivacyContextValue>(
    () => ({
      preferences,
      analyticsConfigured,
      sessionReplayConfigured,
      settingsOpen,
      setSettingsOpen,
      savePreferences,
    }),
    [preferences, savePreferences, settingsOpen]
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);
  if (!context) throw new Error("usePrivacy must be used inside PrivacyProvider");
  return context;
}
