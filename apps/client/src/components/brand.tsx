import { Link } from "react-router-dom";
import { cn } from "../lib/cn";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      to="/"
      aria-label={compact ? "Mimorii home" : undefined}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg text-ink outline-none focus-visible:ring-2 focus-visible:ring-coral-strong",
        className
      )}
    >
      <img src="/mimorii-app-icon.png" alt="" className="size-9 object-contain" />
      {compact ? null : (
        <span className="font-display text-lg font-extrabold tracking-tight">mimorii</span>
      )}
    </Link>
  );
}
