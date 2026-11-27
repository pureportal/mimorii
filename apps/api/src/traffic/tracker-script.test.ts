import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { trackerScript } from "./tracker-script.js";

interface Tracker {
  track: (name: string) => void;
  consent: (granted: boolean) => void;
}

function loadTracker({ consentMode = false, doNotTrack = null as string | null } = {}) {
  const fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ heatmaps: false }) })
  );
  const sendBeacon = vi.fn(() => true);
  const listeners = () => undefined;
  const sandbox: Record<string, unknown> = {
    document: {
      currentScript: {
        dataset: { site: "site-key" },
        src: "https://mimorii.example/api/traffic/script.js",
        hasAttribute: (name: string) => consentMode && name === "data-consent",
      },
      referrer: "",
      visibilityState: "visible",
      documentElement: { scrollHeight: 1_000 },
      addEventListener: listeners,
    },
    location: { href: "https://shop.example/cart", hash: "", host: "shop.example" },
    navigator: { doNotTrack, language: "de-DE", sendBeacon },
    history: { pushState: listeners, replaceState: listeners },
    performance: { now: () => 0, getEntriesByType: () => [] },
    PerformanceObserver: class {
      observe() {}
    },
    innerWidth: 1_280,
    innerHeight: 800,
    scrollY: 0,
    addEventListener: listeners,
    setInterval: listeners,
    fetch,
    Intl,
  };
  sandbox.window = sandbox;
  runInNewContext(trackerScript, sandbox);
  return { fetch, sendBeacon, tracker: sandbox.mimorii as Tracker | undefined };
}

function sentEvents(calls: unknown[][]): string[] {
  return calls.flatMap((call) => {
    const body = (call[1] as { body?: string } | string | undefined) ?? "";
    const json = typeof body === "string" ? body : (body.body ?? "");
    return (JSON.parse(json) as { e: Array<{ t: string; n?: string }> }).e.map(
      (event) => event.n ?? event.t
    );
  });
}

describe("tracker script", () => {
  it("sends a pageview right away without consent mode", () => {
    const { fetch } = loadTracker();

    expect(fetch).toHaveBeenCalledWith(
      "https://mimorii.example/api/traffic/collect",
      expect.objectContaining({ method: "POST" })
    );
    expect(sentEvents(fetch.mock.calls)).toEqual(["pageview"]);
  });

  it("sends nothing in consent mode until consent is given and stops after withdrawal", () => {
    const { fetch, sendBeacon, tracker } = loadTracker({ consentMode: true });

    tracker!.track("Before consent");
    expect(fetch).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();

    tracker!.consent(true);
    tracker!.track("Checkout completed");
    expect(sentEvents(fetch.mock.calls)).toEqual(["pageview"]);
    expect(sentEvents(sendBeacon.mock.calls)).toEqual(["Checkout completed"]);

    tracker!.consent(false);
    tracker!.track("After withdrawal");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the browser sends Do Not Track", () => {
    const { fetch, tracker } = loadTracker({ doNotTrack: "1" });

    expect(fetch).not.toHaveBeenCalled();
    expect(tracker).toBeUndefined();
  });
});
