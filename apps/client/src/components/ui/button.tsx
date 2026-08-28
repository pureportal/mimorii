import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold outline-none transition disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-coral-strong [&_svg]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-ink text-canvas shadow-[0_10px_28px_-14px_rgba(0,0,0,.72)] hover:bg-ink/90",
        coral:
          "bg-coral text-night shadow-[0_8px_22px_-12px_rgba(255,125,142,.8)] hover:bg-coral/88",
        outline:
          "border border-line bg-surface text-ink hover:border-lavender hover:bg-lavender-soft",
        ghost: "text-muted hover:bg-ink/5 hover:text-ink",
        danger: "bg-danger/10 text-danger hover:bg-danger/16",
      },
      size: {
        sm: "h-10 rounded-lg px-3 text-xs sm:h-8",
        md: "h-10 px-4",
        lg: "h-12 rounded-2xl px-6 text-base",
        icon: "size-10 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
