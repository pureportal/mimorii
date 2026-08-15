import { Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";

export function GuideArtwork({
  variant,
  className,
}: {
  variant: "portrait" | "map";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "grid place-items-center bg-gradient-to-br from-coral/15 via-lavender-soft to-mint/15 text-violet-strong",
          className
        )}
      >
        <Sparkles className="size-8" />
      </div>
    );
  }

  return (
    <img
      src={variant === "portrait" ? "/art/mimo-guide.png" : "/art/mimo-guide-map.png"}
      alt=""
      loading={variant === "portrait" ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      className={cn("bg-surface object-cover", className)}
    />
  );
}
