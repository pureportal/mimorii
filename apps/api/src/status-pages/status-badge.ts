import type { PublicStatusPage } from "@mimorii/contracts";

const badgeStates: Record<PublicStatusPage["state"], { text: string; color: string }> = {
  operational: { text: "operational", color: "#2f9e6e" },
  degraded: { text: "degraded", color: "#c98a00" },
  outage: { text: "outage", color: "#d64045" },
  maintenance: { text: "maintenance", color: "#6d5fd3" },
};

const label = "status";
const characterWidth = 6.6;
const padding = 10;

export function statusBadgeSvg(state: PublicStatusPage["state"]): string {
  const value = badgeStates[state];
  const labelWidth = Math.round(label.length * characterWidth + padding * 2);
  const valueWidth = Math.round(value.text.length * characterWidth + padding * 2);
  const width = labelWidth + valueWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}: ${value.text}"><title>${label}: ${value.text}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${width}" height="20" rx="4" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#3d3a52"/><rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${value.color}"/><rect width="${width}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${labelWidth / 2}" y="14">${label}</text><text x="${labelWidth + valueWidth / 2}" y="14">${value.text}</text></g></svg>`;
}
