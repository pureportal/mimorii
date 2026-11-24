import { cn } from "../lib/cn";

export type LandingSceneId = "overview" | "resource" | "logs" | "status-page" | "reports";

export function ProductScene({
  scene,
  alt,
  priority = false,
  sizes,
  className,
}: {
  scene: LandingSceneId;
  alt: string;
  priority?: boolean;
  sizes: string;
  className?: string;
}) {
  return (
    <img
      src={`/landing/${scene}.webp`}
      srcSet={`/landing/${scene}-960.webp 960w, /landing/${scene}.webp 1920w`}
      sizes={sizes}
      width={1920}
      height={1080}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className={cn(
        "block h-auto w-full rounded-[1.25rem] border border-white/8 bg-night shadow-[0_40px_90px_-50px_rgba(10,9,28,.85)] sm:rounded-[1.75rem]",
        className
      )}
    />
  );
}
