import {
  createContext,
  useContext,
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
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    return () => {
      root.lang = "en";
    };
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (next) => {
        window.localStorage.setItem(LOCALE_KEY, next);
        setLocaleState(next);
      },
    }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}
