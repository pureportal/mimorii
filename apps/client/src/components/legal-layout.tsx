import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { legalEffectiveDate, legalProvider } from "../lib/legal";
import { cn } from "../lib/cn";
import { useAlternateLanguageLinks, useLocale, type Locale } from "../lib/locale";

const legalNavigation: Record<Locale, { to: string; label: string }[]> = {
  en: [
    { to: "/imprint", label: "Imprint" },
    { to: "/privacy", label: "Privacy policy" },
    { to: "/terms", label: "Terms of Use" },
  ],
  de: [
    { to: "/imprint", label: "Impressum" },
    { to: "/privacy", label: "Datenschutzerklärung" },
    { to: "/terms", label: "Nutzungsbedingungen" },
  ],
};

const addressCopy: Record<Locale, { tradingAs: string; country: string }> = {
  en: { tradingAs: "trading as", country: "Germany" },
  de: { tradingAs: "handelnd unter", country: "Deutschland" },
};

export function LegalPage({
  title,
  children,
  showEffectiveDate = true,
}: {
  title: string;
  children: ReactNode;
  showEffectiveDate?: boolean;
}) {
  const { locale } = useLocale();
  useAlternateLanguageLinks(useLocation().pathname);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-20 pt-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:px-8 lg:pb-28 lg:pt-16">
      <nav
        aria-label={locale === "de" ? "Rechtliches" : "Legal"}
        className="flex flex-wrap gap-2 self-start lg:sticky lg:top-6 lg:grid"
      >
        {legalNavigation[locale].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-ink/5 hover:text-ink",
                isActive && "bg-lavender-soft text-violet-strong"
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <article className="min-w-0 rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-10">
        <header className="border-b border-line pb-8">
          <h1 className="font-display text-4xl font-black tracking-tight break-words hyphens-auto sm:text-5xl">
            {title}
          </h1>
          {showEffectiveDate ? (
            <p className="mt-3 text-sm text-muted">{legalEffectiveDate[locale]}</p>
          ) : null}
        </header>
        <div className="mt-8 grid gap-10">{children}</div>
      </article>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <h2 className="font-display text-2xl font-bold tracking-tight break-words hyphens-auto">
        {title}
      </h2>
      <div className="grid gap-4 text-sm leading-7 text-muted [&_a]:font-semibold [&_a]:text-violet-strong [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

export function LegalAddress() {
  const copy = addressCopy[useLocale().locale];

  return (
    <address className="not-italic">
      {legalProvider.name}, {copy.tradingAs} {legalProvider.businessName}
      <br />
      {legalProvider.street}
      <br />
      {legalProvider.locality}
      <br />
      {copy.country}
    </address>
  );
}
