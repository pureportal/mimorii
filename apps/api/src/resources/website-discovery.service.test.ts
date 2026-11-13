import { describe, expect, it, vi } from "vitest";
import type { TeamAccessService } from "../teams/team-access.service.js";
import type { FaviconFetcherService } from "./favicon-fetcher.service.js";
import {
  WebsiteDiscoveryService,
  registrableDomain,
  websiteChecks,
} from "./website-discovery.service.js";

describe("website discovery", () => {
  it("proposes availability, certificate and domain checks for a secure website", () => {
    expect(
      websiteChecks(new URL("http://shop.example.co.uk"), new URL("https://www.example.co.uk/en"))
    ).toEqual([
      {
        type: "http",
        name: "Website availability",
        intervalSeconds: 60,
        config: {
          target: { url: "http://shop.example.co.uk/", method: "GET" },
          expectedStatuses: [200],
          followRedirects: true,
          validateTls: true,
        },
      },
      {
        type: "tls",
        name: "TLS certificate",
        intervalSeconds: 21_600,
        config: {
          target: { host: "www.example.co.uk", port: 443 },
          certificateWarningDays: 30,
          validateTls: true,
        },
      },
      {
        type: "domain",
        name: "Domain registration",
        intervalSeconds: 86_400,
        config: { target: { domain: "example.co.uk" }, expiryWarningDays: 30 },
      },
    ]);
  });

  it("only proposes availability for plain addresses", () => {
    expect(
      websiteChecks(new URL("http://192.0.2.10:8080"), new URL("http://192.0.2.10:8080")).map(
        (check) => check.type
      )
    ).toEqual(["http"]);
    expect(
      websiteChecks(new URL("http://intranet"), new URL("http://intranet")).map(
        (check) => check.type
      )
    ).toEqual(["http"]);
  });

  it("finds the registrable domain of a host", () => {
    expect(registrableDomain("status.api.mimorii.app")).toBe("mimorii.app");
    expect(registrableDomain("www.example.com.au")).toBe("example.com.au");
    expect(registrableDomain("localhost")).toBeNull();
  });

  it("names a website after its host when the page has no brand", async () => {
    const access = { require: vi.fn(async () => ({})) } as unknown as TeamAccessService;
    const favicons = {
      inspect: vi.fn(async () => ({
        requestedUrl: new URL("https://www.example.com"),
        finalUrl: new URL("https://www.example.com/"),
        reachable: false,
        name: null,
        description: null,
        icon: null,
      })),
    } as unknown as FaviconFetcherService;

    await expect(
      new WebsiteDiscoveryService(access, favicons).discover(
        "user",
        "team",
        "https://www.example.com"
      )
    ).resolves.toMatchObject({
      url: "https://www.example.com/",
      name: "example.com",
      icon: null,
      reachable: false,
    });
    expect(access.require).toHaveBeenCalledWith("user", "team", "member");
  });
});
