function tracker(script: HTMLScriptElement | null): void {
  if (!script) return;
  const siteKey = script.dataset.site;
  if (!siteKey) return;
  const endpoint = script.src.replace(/\/script\.js(?:[?#].*)?$/, "");
  const overlayToken = /(?:^#|&)mimorii-heatmap=([^&]+)/.exec(location.hash)?.[1];
  const device = (): string =>
    innerWidth < 768 ? "mobile" : innerWidth < 1_024 ? "tablet" : "desktop";

  type Event = Record<string, string | number>;

  const selectorFor = (element: Element): string => {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body && parts.length < 6) {
      if (current.id && !/\d{3,}/.test(current.id)) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const tag = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      const siblings = parent
        ? Array.from(parent.children).filter((child) => child.tagName === current!.tagName)
        : [];
      parts.unshift(
        siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})` : tag
      );
      current = parent;
    }
    return parts.join(">");
  };

  if (overlayToken) {
    showHeatmap(decodeURIComponent(overlayToken));
    return;
  }
  if (
    navigator.doNotTrack === "1" ||
    (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl
  ) {
    return;
  }

  let active = false;
  let pageUrl = "";
  let referrer = "";
  let visibleSince = 0;
  let engagedMs = 0;
  let scrollDepth = 0;
  let errors = 0;
  let heatmaps = false;
  let firstPage = true;
  let queue: Event[] = [];
  const vitals: Record<string, number> = {};
  const recentClicks: Array<{ time: number; x: number; y: number }> = [];

  const payload = (events: Event[], url = pageUrl) =>
    JSON.stringify({
      k: siteKey,
      u: url,
      r: referrer,
      w: innerWidth,
      z: Intl.DateTimeFormat().resolvedOptions().timeZone,
      l: navigator.language,
      e: events,
    });

  const send = (events: Event[], url = pageUrl) => {
    if (!active || !events.length) return;
    const body = payload(events, url);
    if (!navigator.sendBeacon?.(`${endpoint}/collect`, body)) {
      void fetch(`${endpoint}/collect`, { method: "POST", body, keepalive: true }).catch(
        () => undefined
      );
    }
  };

  const flush = () => {
    send(queue);
    queue = [];
  };

  const measureScroll = () => {
    const height = document.documentElement.scrollHeight;
    const depth = height > 0 ? Math.min(100, ((scrollY + innerHeight) / height) * 100) : 100;
    scrollDepth = Math.max(scrollDepth, Math.round(depth));
  };

  const pageview = () => {
    if (!active) return;
    measureScroll();
    void fetch(`${endpoint}/collect`, {
      method: "POST",
      body: payload([{ t: "pageview" }]),
      keepalive: true,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { heatmaps?: boolean } | null) => {
        heatmaps = result?.heatmaps === true;
      })
      .catch(() => undefined);
  };

  const leave = () => {
    if (visibleSince) engagedMs += performance.now() - visibleSince;
    visibleSince = document.visibilityState === "visible" ? performance.now() : 0;
    measureScroll();
    const events: Event[] = [...queue, { t: "leave", v: Math.round(engagedMs), s: scrollDepth }];
    if (firstPage) {
      for (const [name, value] of Object.entries(vitals))
        events.push({ t: "vital", n: name, v: value });
    }
    queue = [];
    send(events);
  };

  const navigate = () => {
    if (location.href === pageUrl) return;
    leave();
    referrer = pageUrl;
    pageUrl = location.href;
    engagedMs = 0;
    scrollDepth = 0;
    errors = 0;
    firstPage = false;
    visibleSince = document.visibilityState === "visible" ? performance.now() : 0;
    pageview();
  };

  let started = false;
  const start = () => {
    active = true;
    if (started) return;
    started = true;
    pageUrl = location.href;
    referrer = document.referrer;
    visibleSince = document.visibilityState === "visible" ? performance.now() : 0;
    for (const method of ["pushState", "replaceState"] as const) {
      const original = history[method];
      history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
        original.apply(this, args);
        navigate();
      };
    }
    addEventListener("popstate", navigate);
    addEventListener("scroll", measureScroll, { passive: true });
    addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        if (visibleSince) engagedMs += performance.now() - visibleSince;
        visibleSince = 0;
        flush();
      } else {
        visibleSince = performance.now();
      }
    });

    const reportError = (message: string, source: string | undefined) => {
      if (errors >= 10 || !message) return;
      errors += 1;
      queue.push({ t: "error", n: message.slice(0, 300), s: source ?? "" });
      flush();
    };
    addEventListener("error", (event) => reportError(event.message, event.filename));
    addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      reportError(reason instanceof Error ? reason.message : String(reason), undefined);
    });

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const named = target.closest("[data-mimorii-event]");
        if (named) queue.push({ t: "event", n: named.getAttribute("data-mimorii-event") ?? "" });
        const link = target.closest("a[href]");
        if (link instanceof HTMLAnchorElement && link.host && link.host !== location.host) {
          queue.push({ t: "event", n: `Outbound link: ${link.hostname}` });
        }
        if (heatmaps && !target.closest("[data-mimorii-mask]")) {
          const element =
            target.closest(
              "a,button,input,select,textarea,label,summary,[role=button],[onclick]"
            ) ?? target;
          const rect = element.getBoundingClientRect();
          const now = performance.now();
          while (recentClicks.length && now - recentClicks[0]!.time > 800) recentClicks.shift();
          recentClicks.push({ time: now, x: event.clientX, y: event.clientY });
          const rage =
            recentClicks.filter(
              (click) => Math.hypot(click.x - event.clientX, click.y - event.clientY) < 40
            ).length >= 3;
          const interactive =
            element !== target || target.matches("a,button,[role=button],summary");
          const label = interactive
            ? (element.getAttribute("aria-label") ?? (element as HTMLElement).innerText ?? "")
                .trim()
                .slice(0, 60)
            : "";
          queue.push({
            t: "click",
            s: selectorFor(element),
            l:
              element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
                ? ""
                : label,
            x: rect.width ? Math.round(((event.clientX - rect.left) / rect.width) * 1000) : 500,
            y: rect.height ? Math.round(((event.clientY - rect.top) / rect.height) * 1000) : 500,
            ...(rage ? { g: 1 } : {}),
          });
        }
        if (queue.length >= 20 || named || link) flush();
      },
      { capture: true }
    );
    setInterval(flush, 10_000);

    const observe = (
      type: string,
      handle: (entries: PerformanceEntry[]) => void,
      extra: object = {}
    ) => {
      try {
        new PerformanceObserver((list) => handle(list.getEntries())).observe({
          type,
          buffered: true,
          ...extra,
        });
      } catch {
        return;
      }
    };
    observe("largest-contentful-paint", (entries) => {
      const last = entries.at(-1);
      if (last) vitals.LCP = Math.round(last.startTime);
    });
    observe("paint", (entries) => {
      const paint = entries.find((entry) => entry.name === "first-contentful-paint");
      if (paint) vitals.FCP = Math.round(paint.startTime);
    });
    observe("layout-shift", (entries) => {
      for (const entry of entries as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput)
          vitals.CLS = Math.round(((vitals.CLS ?? 0) + entry.value) * 1000) / 1000;
      }
    });
    observe(
      "event",
      (entries) => {
        for (const entry of entries)
          vitals.INP = Math.max(vitals.INP ?? 0, Math.round(entry.duration));
      },
      { durationThreshold: 40 }
    );
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigation) vitals.TTFB = Math.round(navigation.responseStart);
    pageview();
  };

  (
    window as unknown as {
      mimorii: { track: (name: string) => void; consent: (granted: boolean) => void };
    }
  ).mimorii = {
    track: (name: string) => {
      if (!active) return;
      queue.push({ t: "event", n: name });
      flush();
    },
    consent: (granted: boolean) => {
      if (granted) {
        start();
      } else {
        active = false;
        queue = [];
      }
    },
  };
  if (!script.hasAttribute("data-consent")) start();

  function showHeatmap(token: string): void {
    const canvas = document.createElement("canvas");
    const bar = document.createElement("div");
    canvas.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:2147483646";
    bar.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1e1b2e;color:#fff;font:600 13px system-ui,sans-serif;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25)";
    bar.textContent = "Loading heatmap…";
    const close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("aria-label", "Close heatmap");
    close.style.cssText =
      "margin-left:12px;background:none;border:0;color:inherit;font:inherit;cursor:pointer";
    close.onclick = () => {
      canvas.remove();
      bar.remove();
      history.replaceState(null, "", location.pathname + location.search);
    };
    let points: Array<{
      selector: string;
      x: number;
      y: number;
      clicks: number;
      rageClicks: number;
    }> = [];
    const draw = () => {
      const width = document.documentElement.scrollWidth;
      const height = Math.min(document.documentElement.scrollHeight, 32_000);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      const maximum = Math.max(1, ...points.map((point) => point.clicks));
      for (const point of points) {
        const element = document.querySelector(point.selector);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const x = rect.left + scrollX + (point.x / 1000) * rect.width;
        const y = rect.top + scrollY + (point.y / 1000) * rect.height;
        const radius = 18 + 22 * (point.clicks / maximum);
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        const color = point.rageClicks ? "239,68,68" : "249,115,22";
        gradient.addColorStop(0, `rgba(${color},${0.35 + 0.5 * (point.clicks / maximum)})`);
        gradient.addColorStop(1, `rgba(${color},0)`);
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    };
    const load = () => {
      const query = new URLSearchParams({ token, path: location.pathname, device: device() });
      void fetch(`${endpoint}/heatmap?${query}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
        .then((overlay: { points: typeof points }) => {
          points = overlay.points;
          const total = points.reduce((sum, point) => sum + point.clicks, 0);
          bar.textContent = `${total.toLocaleString()} clicks · ${device()}`;
          bar.append(close);
          draw();
        })
        .catch(() => {
          bar.textContent = "Heatmap link expired";
          bar.append(close);
        });
    };
    const mount = () => {
      document.body.append(canvas, bar);
      load();
    };
    if (document.body) mount();
    else addEventListener("DOMContentLoaded", mount);
    let resizeTimer = 0;
    addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(load, 300);
    });
  }
}

export const trackerScript = `(${tracker.toString()})(document.currentScript);`;
