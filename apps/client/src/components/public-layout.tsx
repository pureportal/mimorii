import { Menu, Moon, Sun, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Suspense, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { usePublicTheme, type PublicTheme } from "../lib/public-theme";
import { Brand } from "./brand";
import { LoadingState } from "./page-state";
import { PrivacySettingsButton } from "./privacy-controls";
import { SponsorFavicon } from "./sponsor-favicon";
import { Button } from "./ui/button";

export function PublicLayout() {
  const { theme, toggleTheme } = usePublicTheme();

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="public-shell flex min-h-dvh flex-col overflow-x-clip bg-canvas text-ink"
        data-theme={theme}
        style={{ colorScheme: theme }}
      >
        <PublicHeader theme={theme} onThemeToggle={toggleTheme} />
        <div className="flex flex-1 flex-col [&>*]:flex-1">
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </div>
        <PublicFooter />
        <SponsorFavicon />
      </div>
    </MotionConfig>
  );
}

function PublicHeader({ theme, onThemeToggle }: { theme: PublicTheme; onThemeToggle: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-canvas/86 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8">
        <Brand />
        <nav
          aria-label="Primary"
          className="hidden items-center gap-7 text-sm font-medium text-muted md:flex"
        >
          <a href="/#monitoring" className="transition hover:text-ink">
            Monitoring
          </a>
          <a href="/#agents" className="transition hover:text-ink">
            Agents
          </a>
          <Link to="/sponsors" className="transition hover:text-ink">
            Sponsors
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            onClick={onThemeToggle}
          >
            {theme === "light" ? <Moon /> : <Sun />}
          </Button>
          <Button asChild variant="ghost" className="hidden lg:inline-flex">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild variant="coral" className="hidden md:inline-flex">
            <Link to="/register">Get started</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={menuOpen}
            aria-controls="public-mobile-navigation"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
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
              <MobileHeaderLink href="/#monitoring" onNavigate={() => setMenuOpen(false)}>
                Monitoring
              </MobileHeaderLink>
              <MobileHeaderLink href="/#agents" onNavigate={() => setMenuOpen(false)}>
                Agents
              </MobileHeaderLink>
              <Link
                to="/sponsors"
                className="rounded-xl px-3 py-3 text-sm font-semibold text-muted hover:bg-ink/5 hover:text-ink"
                onClick={() => setMenuOpen(false)}
              >
                Sponsors
              </Link>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-4">
                <Button asChild variant="outline">
                  <Link to="/login" onClick={() => setMenuOpen(false)}>
                    Sign in
                  </Link>
                </Button>
                <Button asChild variant="coral">
                  <Link to="/register" onClick={() => setMenuOpen(false)}>
                    Get started
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

function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-8 sm:flex-row lg:px-8">
        <Brand />
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
        >
          <FooterLink to="/sponsors">Sponsors</FooterLink>
          <FooterLink to="/privacy">Privacy</FooterLink>
          <FooterLink to="/terms">Terms</FooterLink>
          <FooterLink to="/imprint">Imprint</FooterLink>
          <PrivacySettingsButton variant="ghost" size="sm" className="h-auto p-0" />
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

function MobileHeaderLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: string;
}) {
  return (
    <a
      href={href}
      className="rounded-xl px-3 py-3 text-sm font-semibold text-muted hover:bg-ink/5 hover:text-ink"
      onClick={onNavigate}
    >
      {children}
    </a>
  );
}
