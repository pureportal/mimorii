import type { Locale } from "../lib/locale";

export interface PrivacyControlsCopy {
  title: string;
  description: string;
  choices: string;
  reject: string;
  accept: string;
  chooseSettings: string;
  privacyPolicy: string;
  settingsTitle: string;
  close: string;
  requiredStorage: { label: string; description: string };
  usageAnalytics: { label: string; description: string };
  rejectOptional: string;
  saveChoices: string;
}

export const privacyControlsCopy: Record<Locale, PrivacyControlsCopy> = {
  en: {
    title: "Help make Mimorii better",
    description:
      "Share anonymous page views, feature use, clicks, performance, and error data so we can find friction and fix issues faster. It stays off until you agree, and you can change your choice anytime.",
    choices: "Privacy choices",
    reject: "Reject",
    accept: "Accept",
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
        "Page views, feature use, clicks, performance, errors, and device type, measured by Mimorii itself without cookies or an account ID.",
    },
    rejectOptional: "Reject optional",
    saveChoices: "Save choices",
  },
  de: {
    title: "Helfen Sie, Mimorii zu verbessern",
    description:
      "Teilen Sie anonyme Daten zu Seitenaufrufen, Funktionsnutzung, Klicks, Leistung und Fehlern, damit wir Hürden finden und Probleme schneller beheben. Die Freigabe bleibt deaktiviert, bis Sie zustimmen, und Sie können Ihre Auswahl jederzeit ändern.",
    choices: "Datenschutzauswahl",
    reject: "Ablehnen",
    accept: "Akzeptieren",
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
        "Seitenaufrufe, Funktionsnutzung, Klicks, Leistung, Fehler und Gerätetyp, gemessen von Mimorii selbst, ohne Cookies und ohne Konto-ID.",
    },
    rejectOptional: "Optionale ablehnen",
    saveChoices: "Auswahl speichern",
  },
};
