import type { WebsiteCheckSuggestion, WebsiteDiscovery } from "@mimorii/contracts";
import { Injectable } from "@nestjs/common";
import { isIP } from "node:net";
import { TeamAccessService } from "../teams/team-access.service.js";
import { FaviconFetcherService } from "./favicon-fetcher.service.js";

const secondLevelLabels = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
const expiryWarningDays = 30;

@Injectable()
export class WebsiteDiscoveryService {
  constructor(
    private readonly access: TeamAccessService,
    private readonly favicons: FaviconFetcherService
  ) {}

  async discover(userId: string, teamId: string, url: string): Promise<WebsiteDiscovery> {
    await this.access.require(userId, teamId, "member");
    const inspection = await this.favicons.inspect(url);
    return {
      url: inspection.finalUrl.toString(),
      name: inspection.name ?? inspection.finalUrl.hostname.replace(/^www\./, ""),
      description: inspection.description,
      icon: inspection.icon ? `data:image/png;base64,${inspection.icon.toString("base64")}` : null,
      reachable: inspection.reachable,
      checks: websiteChecks(inspection.requestedUrl, inspection.finalUrl),
    };
  }
}

export function websiteChecks(requestedUrl: URL, finalUrl: URL): WebsiteCheckSuggestion[] {
  const checks: WebsiteCheckSuggestion[] = [
    {
      type: "http",
      name: "Website availability",
      intervalSeconds: 60,
      config: {
        target: { url: requestedUrl.toString(), method: "GET" },
        expectedStatuses: [200],
        followRedirects: true,
        validateTls: true,
      },
    },
  ];
  const host = finalUrl.hostname;
  if (isIP(host.replace(/^\[|\]$/g, ""))) return checks;
  if (finalUrl.protocol === "https:") {
    checks.push({
      type: "tls",
      name: "TLS certificate",
      intervalSeconds: 21_600,
      config: {
        target: { host, port: Number(finalUrl.port || 443) },
        certificateWarningDays: expiryWarningDays,
        validateTls: true,
      },
    });
  }
  const domain = registrableDomain(host);
  if (domain) {
    checks.push({
      type: "domain",
      name: "Domain registration",
      intervalSeconds: 86_400,
      config: { target: { domain }, expiryWarningDays },
    });
  }
  return checks;
}

export function registrableDomain(hostname: string): string | null {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length < 2) return null;
  const topLevel = labels.at(-1)!;
  const secondLevel = labels.at(-2)!;
  const size = topLevel.length === 2 && secondLevelLabels.has(secondLevel) ? 3 : 2;
  return labels.length >= size ? labels.slice(-size).join(".") : null;
}
