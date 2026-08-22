import type { SponsorSummary } from "@mimorii/contracts";
import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { cn } from "../lib/cn";
import { sponsorUrl } from "../lib/sponsors";
import { Button } from "./ui/button";

type CarouselApi = NonNullable<UseEmblaCarouselType[1]>;

interface SponsorCarouselProps {
  sponsors: SponsorSummary[];
  labelledBy: string;
  maxColumns?: 2 | 3;
  theme?: "light" | "dark";
}

export function SponsorCarousel({
  sponsors,
  labelledBy,
  maxColumns = 3,
  theme = "light",
}: SponsorCarouselProps) {
  const [viewportRef, carouselApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    loop: false,
  });
  const prefersReducedMotion = usePrefersReducedMotion();
  const [selectedSnap, setSelectedSnap] = useState(0);
  const [snapCount, setSnapCount] = useState(1);
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateCarouselState = useCallback((api: CarouselApi) => {
    setSelectedSnap(api.selectedScrollSnap());
    setSnapCount(Math.max(api.scrollSnapList().length, 1));
    setCanScrollPrevious(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, []);

  useEffect(() => {
    if (!carouselApi) return undefined;
    updateCarouselState(carouselApi);
    carouselApi.on("select", updateCarouselState).on("reInit", updateCarouselState);
    return () => {
      carouselApi.off("select", updateCarouselState).off("reInit", updateCarouselState);
    };
  }, [carouselApi, updateCarouselState]);

  function scrollPrevious() {
    carouselApi?.scrollPrev(prefersReducedMotion);
  }

  function scrollNext() {
    carouselApi?.scrollNext(prefersReducedMotion);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollPrevious();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollNext();
    }
  }

  return (
    <section
      aria-labelledby={labelledBy}
      aria-roledescription="carousel"
      className="min-w-0"
      role="region"
    >
      {sponsors.length > 1 && snapCount > 1 ? (
        <div className="mb-3 flex items-center justify-end gap-1.5">
          <span
            aria-atomic="true"
            aria-live="polite"
            className={cn(
              "mr-1 text-xs font-semibold",
              theme === "dark" ? "text-white/65" : "text-muted"
            )}
          >
            {selectedSnap + 1} / {snapCount}
          </span>
          <Button
            aria-label="Previous sponsors"
            className={cn(
              theme === "dark" &&
                "border border-white/12 text-white hover:border-white/25 hover:bg-white/10 hover:text-white"
            )}
            disabled={!canScrollPrevious}
            onClick={scrollPrevious}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <Button
            aria-label="Next sponsors"
            className={cn(
              theme === "dark" &&
                "border border-white/12 text-white hover:border-white/25 hover:bg-white/10 hover:text-white"
            )}
            disabled={!canScrollNext}
            onClick={scrollNext}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <div
        aria-keyshortcuts={snapCount > 1 ? "ArrowLeft ArrowRight" : undefined}
        className="overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-coral/55"
        onKeyDown={handleKeyDown}
        ref={viewportRef}
        tabIndex={snapCount > 1 ? 0 : undefined}
      >
        <div className="-ml-3 flex touch-pan-y">
          {sponsors.map((sponsor, index) => (
            <div
              aria-label={`${index + 1} of ${sponsors.length}`}
              aria-roledescription="slide"
              className={cn(
                "min-w-0 shrink-0 basis-full pl-3 sm:basis-1/2",
                maxColumns === 3 && "xl:basis-1/3"
              )}
              key={sponsor.id}
              role="group"
            >
              <SponsorCard sponsor={sponsor} theme={theme} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SponsorCard({ sponsor, theme }: { sponsor: SponsorSummary; theme: "light" | "dark" }) {
  const faviconUrl = sponsor.faviconUpdatedAt
    ? sponsorUrl(
        `/sponsors/${encodeURIComponent(sponsor.id)}/favicon?v=${encodeURIComponent(sponsor.faviconUpdatedAt)}`
      )
    : null;
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl font-display text-lg font-black",
          faviconUrl
            ? theme === "dark"
              ? "border border-white/10 bg-white/[.07] p-1.5"
              : "border border-line/70 bg-surface/80 p-1.5"
            : theme === "dark"
              ? "bg-white/12 text-white"
              : "bg-ink/6 text-violet-strong"
        )}
      >
        {faviconUrl ? (
          <img alt="" className="size-full object-contain" src={faviconUrl} />
        ) : (
          sponsor.name.slice(0, 1).toLocaleUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1 break-words font-semibold leading-tight">{sponsor.name}</span>
      {sponsor.websiteUrl ? (
        <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
      ) : null}
    </>
  );
  const className = cn(
    "flex h-full min-h-16 min-w-0 items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-3 transition",
    theme === "dark"
      ? "border-white/10 bg-white/7 text-white hover:border-white/20 hover:bg-white/11"
      : "border-line bg-surface/70 text-ink hover:border-lavender hover:bg-surface"
  );

  return sponsor.websiteUrl ? (
    <a
      className={cn(className, "outline-none focus-visible:ring-2 focus-visible:ring-coral/55")}
      href={sponsor.websiteUrl}
      rel="noreferrer"
      target="_blank"
    >
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return undefined;
    const update = () => setPrefersReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}
