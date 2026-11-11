import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "role"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <input
        type="checkbox"
        role="switch"
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        {...props}
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 rounded-full border border-line bg-ink/8 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-[18px] after:rounded-full after:bg-ink/80 after:shadow-sm after:transition-transform peer-checked:border-violet-strong peer-checked:bg-violet-strong peer-checked:after:translate-x-5 peer-checked:after:bg-night peer-focus-visible:ring-2 peer-focus-visible:ring-coral-strong peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface peer-disabled:opacity-50"
      />
    </span>
  );
}
