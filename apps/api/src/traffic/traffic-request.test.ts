import { describe, expect, it } from "vitest";
import { createSignedReference } from "../common/crypto.js";
import { trackerScript } from "./tracker-script.js";
import { heatmapTokenPrefix, verifiedHeatmapSite } from "./traffic-heatmap-token.js";
import {
  hostMatches,
  isBot,
  normalizeDomain,
  parseBatch,
  parseUserAgent,
} from "./traffic-request.js";

const chrome =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

describe("parseBatch", () => {
  it("normalizes page context without keeping query strings or full referrers", () => {
    const batch = parseBatch(
      JSON.stringify({
        k: "mim_site_key",
        u: "https://www.example.com/pricing/?utm_source=newsletter&utm_campaign=launch&email=a@b.c#top",
        r: "https://news.ycombinator.com/item?id=1",
        w: 390,
        z: "Europe/Berlin",
        l: "de-DE",
        e: [{ t: "pageview" }, { t: "unknown" }],
      })
    );
    expect(batch).toMatchObject({
      siteKey: "mim_site_key",
      path: "/pricing",
      referrer: "news.ycombinator.com",
      device: "mobile",
      country: "DE",
      language: "de",
      utmSource: "newsletter",
      utmCampaign: "launch",
      events: [{ kind: "pageview" }],
    });
  });

  it("bounds values and drops malformed events", () => {
    const batch = parseBatch({
      k: "key",
      u: "https://example.com/",
      e: [
        { t: "leave", v: 99_999_999, s: 140 },
        { t: "vital", n: "LCP", v: 1234 },
        { t: "vital", n: "FID", v: 10 },
        { t: "click", s: "#buy", l: "Buy now", x: 2000, y: -5, g: 1 },
        { t: "error", n: "TypeError: x is undefined", s: "https://example.com/app.js?v=3" },
      ],
    });
    expect(batch?.events).toEqual([
      { kind: "leave", engagedMs: 1_800_000, scrollDepth: 100 },
      { kind: "vital", name: "LCP", value: 1234 },
      { kind: "click", selector: "#buy", label: "Buy now", x: 1000, y: 0, rage: true },
      { kind: "error", message: "TypeError: x is undefined", source: "https://example.com/app.js" },
    ]);
  });

  it("masks identifiers in paths and personal data in free text", () => {
    const batch = parseBatch({
      k: "key",
      u: "https://example.com/invite/Xq3vT9bLm2Kp8RzW4nYc/teams/0b9e7c1a-3f4d-4e5b-8a6c-2d1e0f9a8b7c/orders/1234567",
      e: [
        { t: "event", n: "Signup jane.doe@example.com" },
        { t: "error", n: "Order 98765432 failed for max@example.org" },
        { t: "click", s: "#pay", l: "Pay as jane@example.com", x: 1, y: 1 },
      ],
    });
    expect(batch?.path).toBe("/invite/:id/teams/:id/orders/:id");
    expect(batch?.events).toEqual([
      { kind: "event", name: "Signup [email]" },
      { kind: "error", message: "Order [number] failed for [email]", source: null },
      { kind: "click", selector: "#pay", label: "Pay as [email]", x: 1, y: 1, rage: false },
    ]);
    expect(
      parseBatch({
        k: "key",
        u: "https://example.com/blog/how-to-2024-guide/2024",
        e: [{ t: "pageview" }],
      })?.path
    ).toBe("/blog/how-to-2024-guide/2024");
  });

  it("rejects payloads without a site key, URL, or valid events", () => {
    expect(parseBatch("not json")).toBeNull();
    expect(parseBatch({ k: "key", u: "javascript:alert(1)", e: [{ t: "pageview" }] })).toBeNull();
    expect(parseBatch({ k: "key", u: "https://example.com", e: [{ t: "nope" }] })).toBeNull();
  });
});

describe("client detection", () => {
  it("parses common browsers and operating systems", () => {
    expect(parseUserAgent(chrome)).toEqual({ browser: "Chrome", os: "Windows" });
    expect(
      parseUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
      )
    ).toEqual({ browser: "Safari", os: "iOS" });
    expect(parseUserAgent(`${chrome} Edg/141.0`).browser).toBe("Edge");
  });

  it("filters bots and headless browsers", () => {
    expect(isBot("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isBot(chrome.replace("Chrome", "HeadlessChrome"))).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(chrome)).toBe(false);
  });
});

describe("domains", () => {
  it("normalizes entered domains and matches subdomains", () => {
    expect(normalizeDomain("https://www.Example.com/path")).toBe("example.com");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(hostMatches("shop.example.com", ["example.com"])).toBe(true);
    expect(hostMatches("example.com.evil.net", ["example.com"])).toBe(false);
  });
});

describe("heatmap links", () => {
  it("accepts signed, unexpired tokens only", () => {
    const now = Date.now();
    const token = createSignedReference(heatmapTokenPrefix, `site-1~${now + 1_000}`);
    expect(verifiedHeatmapSite(token, now)).toBe("site-1");
    expect(verifiedHeatmapSite(token, now + 2_000)).toBeNull();
    expect(verifiedHeatmapSite(`${token}x`, now)).toBeNull();
    expect(verifiedHeatmapSite(undefined, now)).toBeNull();
  });
});

describe("tracker script", () => {
  it("is a self-invoking script bound to its own script element", () => {
    expect(trackerScript.startsWith("(function tracker(")).toBe(true);
    expect(trackerScript.endsWith("(document.currentScript);")).toBe(true);
    expect(() => new Function(trackerScript)).not.toThrow();
  });
});
