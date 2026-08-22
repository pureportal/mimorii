import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ComponentProps, type ReactNode } from "react";
import { useAndroidBackHandler } from "../../lib/android-back";
import { cn } from "../../lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  closeDisabled = false,
  presentation = "modal",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  closeDisabled?: boolean;
  presentation?: "modal" | "drawer";
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawer = presentation === "drawer";
  useAndroidBackHandler(() => {
    if (!closeDisabled) closeButtonRef.current?.click();
  });

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-night/70 backdrop-blur-[2px] data-[state=open]:animate-fade-in",
          drawer && "bg-night/56 backdrop-blur-[1px]"
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          drawer
            ? "fixed inset-y-0 left-0 z-50 flex w-[min(22rem,calc(100vw-2.5rem))] max-w-none flex-col overflow-hidden rounded-r-[1.75rem] border-y-0 border-l-0 border-r border-line bg-surface p-0 pt-[var(--safe-area-top)] pr-[var(--safe-area-right)] pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] shadow-[18px_0_44px_-22px_rgba(0,0,0,.9)] outline-none"
            : "safe-dialog fixed left-1/2 top-1/2 z-50 max-h-[min(90vh,760px)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-2xl outline-none",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          ref={closeButtonRef}
          disabled={closeDisabled}
          className={cn(
            "absolute grid size-9 place-items-center rounded-full text-muted outline-none hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-coral/50 disabled:pointer-events-none disabled:opacity-45",
            drawer
              ? "right-[calc(1rem+var(--safe-area-right))] top-[calc(0.75rem+var(--safe-area-top))]"
              : "right-4 top-4"
          )}
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 pr-8", className)}>
      <DialogPrimitive.Title className="font-display text-xl font-bold text-ink">
        {title}
      </DialogPrimitive.Title>
      {children ? (
        <DialogPrimitive.Description className="mt-1 text-sm text-muted">
          {children}
        </DialogPrimitive.Description>
      ) : null}
    </div>
  );
}
