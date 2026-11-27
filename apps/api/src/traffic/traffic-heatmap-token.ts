import { verifySignedReference } from "../common/crypto.js";

export const heatmapTokenPrefix = "traffic-heatmap";

export function verifiedHeatmapSite(token: string | undefined, now = Date.now()): string | null {
  const reference = token ? verifySignedReference(heatmapTokenPrefix, token) : null;
  const [siteId, expiresAt] = reference?.split("~") ?? [];
  return siteId && expiresAt && Number(expiresAt) >= now ? siteId : null;
}
