import { BadRequestException, Injectable } from "@nestjs/common";
import ipaddr from "ipaddr.js";
import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { domainToASCII } from "node:url";

export class UnsafeTargetException extends BadRequestException {}

@Injectable()
export class TargetSafetyService {
  async resolvePublicHost(hostname: string): Promise<string[]> {
    const results = await this.resolve(
      hostname,
      process.env.MIMORII_ALLOW_PRIVATE_DIRECT_TARGETS === "true"
    );
    return results.map((result) => result.address);
  }

  resolveStrictPublicHost(hostname: string): Promise<LookupAddress[]> {
    return this.resolve(hostname, false);
  }

  normalizeHost(hostname: string): string {
    const unwrapped = hostname.trim().replace(/^\[|\]$/g, "");
    if (!unwrapped || unwrapped.length > 253 || unwrapped.toLowerCase() === "localhost") {
      throw new UnsafeTargetException("Target host is invalid");
    }
    if (ipaddr.isValid(unwrapped)) return unwrapped;
    const ascii = domainToASCII(unwrapped).toLowerCase().replace(/\.$/, "");
    if (!ascii || ascii.endsWith(".local") || ascii.includes("..")) {
      throw new UnsafeTargetException("Target host is invalid");
    }
    return ascii;
  }

  validateHttpUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException("HTTP URL is invalid");
    }
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
      throw new BadRequestException("HTTP URL is invalid");
    }
    this.normalizeHost(url.hostname);
    return url;
  }

  private async resolve(hostname: string, allowPrivate: boolean): Promise<LookupAddress[]> {
    const normalized = this.normalizeHost(hostname);
    const results = await lookup(normalized, { all: true, verbatim: true }).catch(() => []);
    if (results.length === 0) throw new BadRequestException("Target could not be resolved");
    if (!allowPrivate && results.some((result) => !this.isPublic(result.address))) {
      throw new UnsafeTargetException("Target cannot use a private or reserved network");
    }
    return results.filter(
      (result, index) =>
        results.findIndex(
          (candidate) => candidate.address === result.address && candidate.family === result.family
        ) === index
    );
  }

  private isPublic(address: string): boolean {
    if (!ipaddr.isValid(address)) return false;
    const parsed = ipaddr.parse(address);
    if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
      return parsed.toIPv4Address().range() === "unicast";
    }
    return parsed.range() === "unicast";
  }
}
