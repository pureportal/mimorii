import type { SponsorSummary } from "@mimorii/contracts";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type FocusEvent } from "react";
import { apiAssetUrl } from "../lib/api";
import { cn } from "../lib/cn";
import { useSponsors } from "../lib/sponsors";

const rotationInterval = 8_000;

interface SponsorFaviconProps {
  placement?: "viewport" | "inline";
}

type SponsorWithFavicon = SponsorSummary & { faviconUpdatedAt: string };

export function SponsorFavicon({ placement = "viewport" }: SponsorFaviconProps) {
  const sponsors = useSponsors();
  const eligibleSponsors = (sponsors.data ?? [])
    .flatMap((collection) => collection.sponsors)
    .filter(hasFavicon);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (eligibleSponsors.length < 2 || paused) return undefined;
    const interval = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % eligibleSponsors.length);
    }, rotationInterval);
    return () => window.clearInterval(interval);
  }, [eligibleSponsors.length, paused]);

  if (!eligibleSponsors.length) return null;
  const sponsor = eligibleSponsors[activeIndex % eligibleSponsors.length]!;

  function resumeAfterFocus(event: FocusEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node && event.currentTarget.contains(nextTarget))) {
      setPaused(false);
    }
  }

  return (
    <aside
      aria-label="Sponsor"
      className={cn(
        "pointer-events-none size-11 shrink-0",
        placement === "viewport" && "fixed bottom-3 right-3 z-20 sm:bottom-4 sm:right-4"
      )}
      onBlurCapture={resumeAfterFocus}
      onFocusCapture={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {reducedMotion ? (
        <SponsorFaviconLink key={sponsor.id} sponsor={sponsor} />
      ) : (
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            animate={{ opacity: 1 }}
            className="size-11"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={sponsor.id}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <SponsorFaviconLink sponsor={sponsor} />
          </motion.div>
        </AnimatePresence>
      )}
    </aside>
  );
}

function SponsorFaviconLink({ sponsor }: { sponsor: SponsorWithFavicon }) {
  const favicon = (
    <img
      alt=""
      className="size-6 object-contain"
      height={24}
      src={apiAssetUrl(
        `/sponsors/${encodeURIComponent(sponsor.id)}/favicon?v=${encodeURIComponent(sponsor.faviconUpdatedAt)}`
      )}
      width={24}
    />
  );
  const className =
    "grid size-11 place-items-center rounded-full border border-line/70 bg-surface/88 shadow-card backdrop-blur-lg";

  return sponsor.websiteUrl ? (
    <a
      aria-label={`Visit ${sponsor.name}`}
      className={`${className} pointer-events-auto outline-none transition-colors hover:border-lavender focus-visible:ring-2 focus-visible:ring-coral-strong`}
      href={sponsor.websiteUrl}
      rel="noreferrer"
      target="_blank"
    >
      {favicon}
    </a>
  ) : (
    <span aria-label={sponsor.name} className={className} role="img">
      {favicon}
    </span>
  );
}

function hasFavicon(sponsor: SponsorSummary): sponsor is SponsorWithFavicon {
  return sponsor.faviconUpdatedAt !== null;
}
