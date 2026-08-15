import { sponsorshipTiers, type SponsorshipTier } from "@mimorii/contracts";

export interface SponsorshipTierDetails {
  tier: SponsorshipTier;
  label: string;
  avatar: string;
  avatarAlt: string;
  accent: string;
  surface: string;
}

const details: Record<SponsorshipTier, Omit<SponsorshipTierDetails, "tier">> = {
  platinum: {
    label: "Platinum",
    avatar: "/art/sponsor-platinum.png",
    avatarAlt: "Platinum cloud empress",
    accent: "bg-platinum-accent",
    surface: "border-platinum-border bg-platinum-surface",
  },
  gold: {
    label: "Gold",
    avatar: "/art/sponsor-gold.png",
    avatarAlt: "Gold infrastructure commander",
    accent: "bg-gold-accent",
    surface: "border-gold-border bg-gold-surface",
  },
  silver: {
    label: "Silver",
    avatar: "/art/sponsor-silver.png",
    avatarAlt: "Silver cloud engineer",
    accent: "bg-silver-accent",
    surface: "border-silver-border bg-silver-surface",
  },
};

export const sponsorshipTierDetails = sponsorshipTiers.map((tier) => ({
  tier,
  ...details[tier],
}));

export function getSponsorshipTierDetails(tier: SponsorshipTier): SponsorshipTierDetails {
  return { tier, ...details[tier] };
}

export function isSponsorshipTier(value: string): value is SponsorshipTier {
  return sponsorshipTiers.some((tier) => tier === value);
}
