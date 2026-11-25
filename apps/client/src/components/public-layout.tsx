import { Menu, Moon, Sun, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Suspense, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAndroidBackHandler } from "../lib/android-back";
import { cn } from "../lib/cn";
import { locales, useLocale, useLocalizedDocument, type Locale } from "../lib/locale";
import { usePublicTheme, type PublicTheme } from "../lib/public-theme";
import { Brand } from "./brand";
import { LoadingState } from "./page-state";
import { PrivacySettingsButton } from "./privacy-controls";
import { SponsorFavicon } from "./sponsor-favicon";
import { Button } from "./ui/button";

const layoutCopy = {
  en: {
    product: "Product",
    download: "Download",
    sponsors: "Sponsors",
    imprint: "Imprint",
    privacy: "Privacy",
    terms: "Terms",
    privacySettings: "Privacy settings",
    signIn: "Sign in",
    getStarted: "Get started",
    language: "Language",
    themeToLight: "Switch to light theme",
    themeToDark: "Switch to dark theme",
    openNavigation: "Open navigation",
    closeNavigation: "Close navigation",
  },
  de: {
    product: "Produkt",
    download: "Download",
    sponsors: "Sponsoren",
    imprint: "Impressum",
    privacy: "Datenschutz",
    terms: "Nutzungsbedingungen",
    privacySettings: "Datenschutzeinstellungen",
    signIn: "Anmelden",
    getStarted: "Loslegen",
    language: "Sprache",
    themeToLight: "Zum hellen Design wechseln",
    themeToDark: "Zum dunklen Design wechseln",
    openNavigation: "Navigation öffnen",
    closeNavigation: "Navigation schließen",
  },
} satisfies Record<Locale, Record<string, string>>;

type LayoutCopy = (typeof layoutCopy)[Locale];

const mobileLinkClass =
  "rounded-xl px-3 py-3 text-sm font-semibold text-muted hover:bg-ink/5 hover:text-ink";

export function PublicLayout() {
  const { theme, toggleTheme } = usePublicTheme();
  const { locale } = useLocale();
  const copy = layoutCopy[locale];
  useLocalizedDocument();

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="public-shell safe-page safe-page-footer flex min-h-dvh flex-col overflow-x-clip bg-canvas text-ink"
        data-theme={theme}
        style={{ colorScheme: theme }}
      >
        <PublicHeader copy={copy} theme={theme} onThemeToggle={toggleTheme} />
        <div className="flex flex-1 flex-col [&>*]:flex-1">
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </div>
        <PublicFooter copy={copy} />
        <SponsorFavicon />
      </div>
    </MotionConfig>
  );
}

function PublicHeader({
  copy,
  theme,
  onThemeToggle,
}: {
  copy: LayoutCopy;
  theme: PublicTheme;
  onThemeToggle: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  useAndroidBackHandler(() => setMenuOpen(false), menuOpen);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="safe-sticky-top sticky z-50 border-b border-line/70 bg-canvas/86 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
        <Brand />
        <nav
          aria-label="Primary"
          className="hidden items-center gap-7 text-sm font-medium text-muted md:flex"
        >
          <a href="/#product" className="transition hover:text-ink">
            {copy.product}
          </a>
          <Link to="/mcp" className="transition hover:text-ink">
            MCP
          </Link>
          <a href="/#download" className="transition hover:text-ink">
            {copy.download}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitch label={copy.language} className="hidden sm:flex" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={theme === "light" ? copy.themeToDark : copy.themeToLight}
            onClick={onThemeToggle}
          >
            {theme === "light" ? <Moon /> : <Sun />}
          </Button>
          <Button asChild variant="ghost" className="hidden lg:inline-flex">
            <Link to="/login">{copy.signIn}</Link>
          </Button>
          <Button asChild variant="coral" className="hidden md:inline-flex">
            <Link to="/register">{copy.getStarted}</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={menuOpen}
            aria-controls="public-mobile-navigation"
            aria-label={menuOpen ? copy.closeNavigation : copy.openNavigation}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {menuOpen ? (
          <motion.nav
            id="public-mobile-navigation"
            aria-label="Mobile primary"
            className="absolute inset-x-0 top-full border-b border-line bg-canvas/96 px-5 pb-5 pt-2 shadow-[0_18px_35px_-28px_rgba(23,21,47,.6)] backdrop-blur-xl md:hidden"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mx-auto grid max-w-7xl gap-1">
              <a href="/#product" className={mobileLinkClass} onClick={closeMenu}>
                {copy.product}
              </a>
              <Link to="/mcp" className={mobileLinkClass} onClick={closeMenu}>
                MCP
              </Link>
              <a href="/#download" className={mobileLinkClass} onClick={closeMenu}>
                {copy.download}
              </a>
              <Link to="/sponsors" className={mobileLinkClass} onClick={closeMenu}>
                {copy.sponsors}
              </Link>
              <LanguageSwitch
                label={copy.language}
                className="mt-2 flex justify-self-start sm:hidden"
              />
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-4">
                <Button asChild variant="outline">
                  <Link to="/login" onClick={closeMenu}>
                    {copy.signIn}
                  </Link>
                </Button>
                <Button asChild variant="coral">
                  <Link to="/register" onClick={closeMenu}>
                    {copy.getStarted}
                  </Link>
                </Button>
              </div>
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function LanguageSwitch({ label, className }: { label: string; className?: string }) {
  const { locale, setLocale } = useLocale();

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("items-center rounded-full border border-line p-0.5", className)}
    >
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={locale === option}
          aria-label={option === "en" ? "English" : "Deutsch"}
          onClick={() => setLocale(option)}
          className={cn(
            "h-8 min-w-9 rounded-full px-2.5 text-xs font-bold uppercase tracking-wide text-muted outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-coral-strong",
            locale === option && "bg-ink/10 text-ink"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function PublicFooter({ copy }: { copy: LayoutCopy }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-8 sm:flex-row lg:px-8">
        <Brand />
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
        >
          <FooterLink to="/sponsors">{copy.sponsors}</FooterLink>
          <FooterLink to="/imprint">{copy.imprint}</FooterLink>
          <FooterLink to="/privacy">{copy.privacy}</FooterLink>
          <FooterLink to="/terms">{copy.terms}</FooterLink>
          <PrivacySettingsButton variant="ghost" size="sm" className="h-auto p-0">
            {copy.privacySettings}
          </PrivacySettingsButton>
        </nav>
      </div>
    </footer>
  );
}

function FooterLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="text-sm font-semibold text-muted hover:text-ink">
      {children}
    </Link>
  );
}
