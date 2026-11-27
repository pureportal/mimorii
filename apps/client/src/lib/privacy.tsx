import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { analyticsConfigured, setAnalyticsConsent } from "./analytics";
import {
  PRIVACY_PREFERENCES_KEY,
  readPrivacyPreferences,
  storePrivacyPreferences,
  type PrivacyPreferences,
} from "./privacy-preferences";

interface PrivacyContextValue {
  preferences: PrivacyPreferences | null;
  analyticsConfigured: boolean;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  savePreferences: (analytics: boolean) => void;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPrivacyPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const savePreferences = useCallback((analytics: boolean) => {
    setPreferences(storePrivacyPreferences(analytics));
  }, []);

  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key === PRIVACY_PREFERENCES_KEY) setPreferences(readPrivacyPreferences());
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  useEffect(() => {
    setAnalyticsConsent(preferences?.analytics === true);
  }, [preferences]);

  const value = useMemo<PrivacyContextValue>(
    () => ({ preferences, analyticsConfigured, settingsOpen, setSettingsOpen, savePreferences }),
    [preferences, savePreferences, settingsOpen]
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);
  if (!context) throw new Error("usePrivacy must be used inside PrivacyProvider");
  return context;
}
