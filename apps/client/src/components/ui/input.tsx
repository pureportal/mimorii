import { Eye, EyeOff } from "lucide-react";
import {
  useState,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
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

export function PasswordInput({
  className,
  disabled,
  visibilityLabel = "password",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { visibilityLabel?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-12", className)}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        aria-label={`${visible ? "Hide" : "Show"} ${visibilityLabel}`}
        aria-pressed={visible}
        disabled={disabled}
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-muted outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-coral-strong disabled:pointer-events-none disabled:opacity-45"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
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
        "h-11 w-full rounded-xl border border-line bg-surface px-3.5 pr-9 text-sm text-ink outline-none transition focus:border-lavender focus:ring-3 focus:ring-lavender/15",
        className
      )}
      {...props}
    />
  );
}
