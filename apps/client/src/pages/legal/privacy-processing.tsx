import type { ReactNode } from "react";

const customSwetrixEndpoint = import.meta.env.VITE_SWETRIX_API_URL?.trim();
export const purePortalSwetrix = swetrixHostname(customSwetrixEndpoint) === "swetrix.pureportal.io";

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

function swetrixHostname(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
