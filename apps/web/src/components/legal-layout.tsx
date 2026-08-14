import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { legalEffectiveDate, legalProvider } from "../lib/legal";
import { cn } from "../lib/cn";

const legalNavigation = [
  { to: "/privacy", label: "Privacy policy" },
  { to: "/terms", label: "Terms of Use" },
  { to: "/imprint", label: "Imprint" },
];

export function LegalPage({
  title,
  children,
  showEffectiveDate = true,
}: {
  title: string;
  children: ReactNode;
  showEffectiveDate?: boolean;
}) {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-20 pt-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:px-8 lg:pb-28 lg:pt-16">
      <nav
        aria-label="Legal"
        className="flex flex-wrap gap-2 self-start lg:sticky lg:top-6 lg:grid"
      >
        {legalNavigation.map((item) => (
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
          <h1 className="font-display text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
          {showEffectiveDate ? (
            <p className="mt-3 text-sm text-muted">Effective {legalEffectiveDate}</p>
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
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
      <div className="grid gap-4 text-sm leading-7 text-muted [&_a]:font-semibold [&_a]:text-violet-strong [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

export function LegalAddress() {
  return (
    <address className="not-italic">
      {legalProvider.name}, trading as {legalProvider.businessName}
      <br />
      {legalProvider.street}
      <br />
      {legalProvider.locality}
      <br />
      {legalProvider.country}
    </address>
  );
}
