import type { SponsorshipTierCollection } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useSponsors() {
  return useQuery({
    queryKey: ["sponsors"],
    queryFn: () => api<SponsorshipTierCollection[]>("/sponsors"),
  });
}
