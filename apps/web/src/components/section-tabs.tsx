import { NavLink } from "react-router-dom";
import { cn } from "../lib/cn";

export function SectionTabs({
  label,
  items,
  className,
}: {
  label: string;
  items: ReadonlyArray<{ label: string; to: string }>;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5",
        className
      )}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className={({ isActive }) =>
            cn(
              "flex h-9 shrink-0 items-center rounded-xl px-3.5 text-sm font-semibold text-muted transition hover:bg-ink/5 hover:text-ink",
              isActive && "bg-lavender-soft text-violet-strong"
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
