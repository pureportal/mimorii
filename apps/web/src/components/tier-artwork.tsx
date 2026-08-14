import type { SponsorshipTier } from "@mimorii/contracts";
import { cn } from "../lib/cn";
import { getSponsorshipTierDetails } from "../lib/sponsorship";

interface TierArtworkProps {
  className?: string;
  tier: SponsorshipTier;
}

export function TierArtwork({ className, tier }: TierArtworkProps) {
  const details = getSponsorshipTierDetails(tier);

  return (
    <div className={cn("tier-artwork", `tier-artwork--${tier}`, className)}>
      <span aria-hidden="true" className="tier-artwork__halo" />
      <div className="tier-artwork__frame">
        <img
          alt={details.avatarAlt}
          className="tier-artwork__image"
          decoding="async"
          height={1254}
          loading="lazy"
          src={details.avatar}
          width={1254}
        />
        <span aria-hidden="true" className="tier-artwork__foil" />
        <span aria-hidden="true" className="tier-artwork__particles" />
      </div>
    </div>
  );
}
