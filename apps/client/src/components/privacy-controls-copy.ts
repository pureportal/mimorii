import type { Locale } from "../lib/locale";

export interface PrivacyControlsCopy {
  title: string;
  description: { withReplay: string; withoutReplay: string };
  choices: string;
  reject: string;
  acceptAll: string;
  chooseSettings: string;
  privacyPolicy: string;
  settingsTitle: string;
  close: string;
  requiredStorage: { label: string; description: string };
  usageAnalytics: { label: string; description: string };
  sessionReplay: { label: string; description: string; requiresAnalytics: string };
  rejectOptional: string;
  saveChoices: string;
}

export const privacyControlsCopy: Record<Locale, PrivacyControlsCopy> = {
  en: {
    title: "Help make Mimorii better",
    description: {
      withReplay:
        "Share optional feature-use, performance, and error data plus masked interaction replays so we can find friction, fix issues faster, and focus improvements where they matter. They stay off until you agree, and you can change your choice anytime.",
      withoutReplay:
        "Share optional feature-use, performance, and error data so we can find friction, fix issues faster, and focus improvements where they matter. It stays off until you agree, and you can change your choice anytime.",
    },
    choices: "Privacy choices",
    reject: "Reject",
    acceptAll: "Accept all",
    chooseSettings: "Choose settings",
    privacyPolicy: "Privacy policy",
    settingsTitle: "Privacy settings",
    close: "Close",
    requiredStorage: {
      label: "Required storage",
      description: "Saves your privacy choice and essential session data. Always active.",
    },
    usageAnalytics: {
      label: "Usage analytics",
      description:
        "Page views, feature use, performance, errors, device details, and an internal account ID help us prioritize improvements.",
    },
    sessionReplay: {
      label: "Session replay",
      description:
        "Sampled, masked interaction recordings reveal where workflows become difficult and may still contain personal data.",
      requiresAnalytics: "Requires usage analytics.",
    },
    rejectOptional: "Reject optional",
    saveChoices: "Save choices",
  },
  de: {
    title: "Helfen Sie, Mimorii zu verbessern",
    description: {
      withReplay:
        "Teilen Sie optionale Daten zu Funktionsnutzung, Leistung und Fehlern sowie maskierte Interaktionsaufzeichnungen, damit wir Hürden finden, Probleme schneller beheben und Verbesserungen dort ansetzen, wo sie zählen. Beides bleibt deaktiviert, bis Sie zustimmen, und Sie können Ihre Auswahl jederzeit ändern.",
      withoutReplay:
        "Teilen Sie optionale Daten zu Funktionsnutzung, Leistung und Fehlern, damit wir Hürden finden, Probleme schneller beheben und Verbesserungen dort ansetzen, wo sie zählen. Die Freigabe bleibt deaktiviert, bis Sie zustimmen, und Sie können Ihre Auswahl jederzeit ändern.",
    },
    choices: "Datenschutzauswahl",
    reject: "Ablehnen",
    acceptAll: "Alle akzeptieren",
    chooseSettings: "Einstellungen wählen",
    privacyPolicy: "Datenschutzerklärung",
    settingsTitle: "Datenschutzeinstellungen",
    close: "Schließen",
    requiredStorage: {
      label: "Erforderlicher Speicher",
      description: "Speichert Ihre Datenschutzauswahl und wesentliche Sitzungsdaten. Immer aktiv.",
    },
    usageAnalytics: {
      label: "Nutzungsanalyse",
      description:
        "Seitenaufrufe, Funktionsnutzung, Leistung, Fehler, Geräteangaben und eine interne Konto-ID helfen uns, Verbesserungen zu priorisieren.",
    },
    sessionReplay: {
      label: "Sitzungsaufzeichnung",
      description:
        "Stichprobenartige, maskierte Interaktionsaufzeichnungen zeigen, wo Abläufe schwierig werden, und können dennoch personenbezogene Daten enthalten.",
      requiresAnalytics: "Erfordert die Nutzungsanalyse.",
    },
    rejectOptional: "Optionale ablehnen",
    saveChoices: "Auswahl speichern",
  },
};
