import type { ReactNode } from "react";

export function ProcessingEntry({
  title,
  legalBasis,
  children,
}: {
  title: string;
  legalBasis: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line p-5">
      <h3 className="font-display text-lg font-bold text-ink break-words hyphens-auto">{title}</h3>
      <p className="text-xs font-semibold text-violet-strong">{legalBasis}</p>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}
