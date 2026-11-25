import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];

const LOCALE_KEY = "mimorii.locale";

function isLocale(value: string | null | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

export function detectLocale(): Locale {
  const requested = new URLSearchParams(window.location.search).get("lang");
  if (isLocale(requested)) {
    window.localStorage.setItem(LOCALE_KEY, requested);
    return requested;
  }
  const saved = window.localStorage.getItem(LOCALE_KEY);
  if (isLocale(saved)) return saved;
  const preferred = navigator.languages
    .map((language) => language.slice(0, 2).toLowerCase())
    .find(isLocale);
  return preferred ?? "en";
}

interface LocaleContextValue {
  locale: Locale;
  documentLocale: Locale;
  setLocale: (locale: Locale) => void;
  setDocumentLocalized: (localized: boolean) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const [documentLocalized, setDocumentLocalized] = useState(false);
  const documentLocale = documentLocalized ? locale : "en";

  useLayoutEffect(() => {
    document.documentElement.lang = documentLocale;
  }, [documentLocale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      documentLocale,
      setLocale: (next) => {
        window.localStorage.setItem(LOCALE_KEY, next);
        setLocaleState(next);
      },
      setDocumentLocalized,
    }),
    [locale, documentLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}

export function useLocalizedDocument() {
  const { setDocumentLocalized } = useLocale();
  useLayoutEffect(() => {
    setDocumentLocalized(true);
    return () => setDocumentLocalized(false);
  }, [setDocumentLocalized]);
}

export function useAlternateLanguageLinks(path: string) {
  useEffect(() => {
    const url = `${window.location.origin}${path}`;
    const links = [...locales, "x-default" as const].map((language) => {
      const link = document.createElement("link");
      link.rel = "alternate";
      link.hreflang = language;
      link.href = language === "x-default" ? url : `${url}?lang=${language}`;
      document.head.append(link);
      return link;
    });
    return () => links.forEach((link) => link.remove());
  }, [path]);
}
