import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink outline-none transition placeholder:text-muted/65 focus:border-lavender focus:ring-3 focus:ring-lavender/15 disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-muted/65 focus:border-lavender focus:ring-3 focus:ring-lavender/15",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full appearance-none rounded-xl border border-line bg-surface px-3.5 text-sm text-ink outline-none transition focus:border-lavender focus:ring-3 focus:ring-lavender/15",
        className
      )}
      {...props}
    />
  );
}
