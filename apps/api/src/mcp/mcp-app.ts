import { McpServer } from "@modelcontextprotocol/server";
import { applicationVersion } from "../version.js";

export const mcpAppsExtensionId = "io.modelcontextprotocol/ui";
export const mcpAppMimeType = "text/html;profile=mcp-app";
export const teamOverviewAppUri = "ui://mimorii/team-health-v1";

export const mcpAppsCapability = {
  [mcpAppsExtensionId]: {
    mimeTypes: [mcpAppMimeType],
  },
};

export const teamOverviewAppMetadata = {
  ui: {
    resourceUri: teamOverviewAppUri,
    visibility: ["model", "app"],
  },
};

const appResourceMetadata = {
  ui: {
    csp: {
      connectDomains: [],
      resourceDomains: [],
      frameDomains: [],
      baseUriDomains: [],
    },
    prefersBorder: true,
  },
};

export function registerMcpAppResources(server: McpServer): void {
  server.registerResource(
    "team_health_dashboard",
    teamOverviewAppUri,
    {
      title: "Team health dashboard",
      description: "Interactive current monitoring overview for a team.",
      mimeType: mcpAppMimeType,
      _meta: appResourceMetadata,
      cacheHint: { ttlMs: 60 * 60_000, cacheScope: "public" },
    },
    async () => ({
      contents: [
        {
          uri: teamOverviewAppUri,
          mimeType: mcpAppMimeType,
          text: teamOverviewAppHtml,
          _meta: appResourceMetadata,
        },
      ],
    })
  );
}

export const teamOverviewAppHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Team health</title>
    <style>
      :root {
        color-scheme: light dark;
        --color-background-primary: light-dark(#ffffff, #17171b);
        --color-background-secondary: light-dark(#f7f7f8, #222227);
        --color-background-tertiary: light-dark(#eeeeef, #2b2b31);
        --color-background-success: light-dark(#e9f8f0, #173b29);
        --color-background-warning: light-dark(#fff5d9, #463717);
        --color-background-danger: light-dark(#ffebe9, #48201f);
        --color-text-primary: light-dark(#18181b, #fafafa);
        --color-text-secondary: light-dark(#62626a, #b8b8c0);
        --color-text-success: light-dark(#147a49, #62d99a);
        --color-text-warning: light-dark(#9a6200, #f0bd4c);
        --color-text-danger: light-dark(#b42318, #ff8d86);
        --color-border-primary: light-dark(#dddddf, #393940);
        --color-border-secondary: light-dark(#e9e9eb, #303037);
        --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --font-weight-medium: 500;
        --font-weight-semibold: 600;
        --font-weight-bold: 700;
        --border-radius-md: 10px;
        --border-radius-lg: 14px;
        --border-radius-full: 999px;
        --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-width: 280px;
        background: var(--color-background-primary);
        color: var(--color-text-primary);
        font-family: var(--font-sans);
      }

      body {
        padding: 16px;
      }

      button {
        border: 1px solid var(--color-border-primary);
        border-radius: var(--border-radius-md);
        background: var(--color-background-secondary);
        color: var(--color-text-primary);
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: var(--font-weight-semibold);
        padding: 8px 12px;
      }

      button:hover:not(:disabled) {
        background: var(--color-background-tertiary);
      }

      button:focus-visible {
        outline: 2px solid var(--color-text-primary);
        outline-offset: 2px;
      }

      button:disabled {
        cursor: default;
        opacity: 0.55;
      }

      .header {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }

      h1,
      h2,
      p {
        margin: 0;
      }

      h1 {
        font-size: 19px;
        letter-spacing: -0.02em;
        line-height: 1.25;
      }

      h2 {
        font-size: 13px;
        font-weight: var(--font-weight-semibold);
      }

      .state {
        align-items: center;
        color: var(--color-text-secondary);
        display: flex;
        font-size: 13px;
        gap: 7px;
        margin-top: 5px;
      }

      .state-dot {
        background: var(--color-text-secondary);
        border-radius: var(--border-radius-full);
        height: 8px;
        width: 8px;
      }

      .state[data-tone="success"] {
        color: var(--color-text-success);
      }

      .state[data-tone="success"] .state-dot {
        background: var(--color-text-success);
      }

      .state[data-tone="warning"] {
        color: var(--color-text-warning);
      }

      .state[data-tone="warning"] .state-dot {
        background: var(--color-text-warning);
      }

      .state[data-tone="danger"] {
        color: var(--color-text-danger);
      }

      .state[data-tone="danger"] .state-dot {
        background: var(--color-text-danger);
      }

      .metrics {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 16px;
      }

      .metric,
      .incident {
        border: 1px solid var(--color-border-secondary);
        border-radius: var(--border-radius-lg);
        background: var(--color-background-secondary);
        box-shadow: var(--shadow-sm);
      }

      .metric {
        min-width: 0;
        padding: 12px;
      }

      .metric-value {
        font-size: 20px;
        font-weight: var(--font-weight-bold);
        letter-spacing: -0.025em;
        line-height: 1.1;
      }

      .metric-label {
        color: var(--color-text-secondary);
        font-size: 12px;
        margin-top: 5px;
      }

      .breakdown {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 12px;
      }

      .pill {
        border: 1px solid var(--color-border-secondary);
        border-radius: var(--border-radius-full);
        color: var(--color-text-secondary);
        font-size: 12px;
        padding: 5px 8px;
      }

      .pill[data-tone="success"] {
        background: var(--color-background-success);
        color: var(--color-text-success);
      }

      .pill[data-tone="warning"] {
        background: var(--color-background-warning);
        color: var(--color-text-warning);
      }

      .pill[data-tone="danger"] {
        background: var(--color-background-danger);
        color: var(--color-text-danger);
      }

      .incidents {
        margin-top: 18px;
      }

      .incident-list {
        display: grid;
        gap: 8px;
        margin-top: 8px;
      }

      .incident {
        align-items: center;
        display: flex;
        gap: 10px;
        justify-content: space-between;
        padding: 11px 12px;
      }

      .incident-title {
        font-size: 13px;
        font-weight: var(--font-weight-medium);
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .incident-status {
        color: var(--color-text-secondary);
        flex: none;
        font-size: 11px;
        text-transform: capitalize;
      }

      .error {
        color: var(--color-text-danger);
        font-size: 12px;
        margin-top: 10px;
      }

      [hidden] {
        display: none !important;
      }

      @media (min-width: 540px) {
        .metrics {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="header">
        <div>
          <h1>Team health</h1>
          <p id="state" class="state" role="status" aria-live="polite">
            <span class="state-dot" aria-hidden="true"></span>
            <span id="state-label">Loading…</span>
          </p>
        </div>
        <button id="refresh" type="button" hidden disabled>Refresh</button>
      </div>
      <div id="metrics" class="metrics" hidden></div>
      <div id="breakdown" class="breakdown" hidden></div>
      <section id="incidents" class="incidents" hidden>
        <h2>Recent incidents</h2>
        <div id="incident-list" class="incident-list"></div>
      </section>
      <p id="error" class="error" role="alert" hidden></p>
    </main>
    <script type="module">
      const appVersion = ${JSON.stringify(applicationVersion)};
      const stateElement = document.querySelector("#state");
      const stateLabelElement = document.querySelector("#state-label");
      const refreshElement = document.querySelector("#refresh");
      const metricsElement = document.querySelector("#metrics");
      const breakdownElement = document.querySelector("#breakdown");
      const incidentsElement = document.querySelector("#incidents");
      const incidentListElement = document.querySelector("#incident-list");
      const errorElement = document.querySelector("#error");
      const pendingRequests = new Map();
      const requestTimeoutMs = 60_000;
      let nextRequestId = 0;
      let teamId;
      let bridgeInitialized = false;
      let canCallServerTools = false;
      let destroyed = false;
      let refreshing = false;
      let resizeObserver;

      function sendNotification(method, params) {
        if (destroyed) return;
        window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
      }

      function sendRequest(method, params) {
        if (destroyed) return Promise.reject(new Error("App was closed"));
        return new Promise((resolve, reject) => {
          const id = ++nextRequestId;
          const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error("Host request timed out"));
          }, requestTimeoutMs);
          pendingRequests.set(id, { resolve, reject, timeout });
          window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
        });
      }

      function sendResponse(id, result) {
        window.parent.postMessage({ jsonrpc: "2.0", id, result }, "*");
      }

      function applyHostContext(context) {
        if (!context || typeof context !== "object") return;
        if (context.theme === "light" || context.theme === "dark") {
          document.documentElement.style.colorScheme = context.theme;
        }
        const variables = context.styles && context.styles.variables;
        if (!variables || typeof variables !== "object") return;
        for (const [name, value] of Object.entries(variables)) {
          if (/^--(?:color|font|border|shadow)-/.test(name) && typeof value === "string") {
            document.documentElement.style.setProperty(name, value);
          }
        }
      }

      function numeric(value) {
        return typeof value === "number" && Number.isFinite(value) ? value : 0;
      }

      function displayNumber(value) {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(numeric(value));
      }

      function displayMetric(value, suffix) {
        return typeof value === "number" && Number.isFinite(value) ? displayNumber(value) + suffix : "—";
      }

      function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
      }

      function setError(message) {
        errorElement.textContent = message || "";
        errorElement.hidden = !message;
      }

      function setBusy(value) {
        refreshing = value;
        refreshElement.disabled = value || !teamId || !canCallServerTools;
        refreshElement.textContent = value ? "Refreshing…" : "Refresh";
      }

      function reportSize() {
        if (!bridgeInitialized || destroyed) return;
        sendNotification("ui/notifications/size-changed", {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        });
      }

      function teardown() {
        destroyed = true;
        bridgeInitialized = false;
        if (resizeObserver) resizeObserver.disconnect();
        for (const pending of pendingRequests.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("App was closed"));
        }
        pendingRequests.clear();
        refreshElement.removeEventListener("click", refresh);
        window.removeEventListener("message", receiveMessage);
      }

      function renderMetrics(data) {
        const metrics = [
          ["Resources", data.resources],
          ["Checks", data.checks],
          ["Heartbeats", data.heartbeats],
          ["24h uptime", displayMetric(data.uptime24h, "%")],
          ["Open incidents", data.openIncidents],
          ["Maintenance", data.activeMaintenance],
          ["SLO breaches", data.breachedObjectives],
          ["Avg latency", displayMetric(data.averageLatencyMs, " ms")],
        ];
        metricsElement.replaceChildren();
        for (const [label, value] of metrics) {
          const card = createElement("div", "metric");
          card.append(
            createElement("div", "metric-value", typeof value === "string" ? value : displayNumber(value)),
            createElement("div", "metric-label", label)
          );
          metricsElement.append(card);
        }
        metricsElement.hidden = false;
      }

      function renderBreakdown(data) {
        const states = [
          ["Passing", data.passing, "success"],
          ["Warning", data.warning, "warning"],
          ["Critical", data.critical, "danger"],
          ["Down", data.down, "danger"],
          ["Pending", data.pending, "neutral"],
          ["Paused", data.paused, "neutral"],
        ];
        breakdownElement.replaceChildren();
        for (const [label, value, tone] of states) {
          const count = numeric(value);
          if (count === 0 && label !== "Passing") continue;
          const pill = createElement("span", "pill", label + " " + displayNumber(count));
          pill.dataset.tone = tone;
          breakdownElement.append(pill);
        }
        breakdownElement.hidden = breakdownElement.childElementCount === 0;
      }

      function renderIncidents(data) {
        const incidents = Array.isArray(data.incidents) ? data.incidents.slice(0, 5) : [];
        incidentListElement.replaceChildren();
        for (const incident of incidents) {
          if (!incident || typeof incident !== "object") continue;
          const row = createElement("div", "incident");
          row.append(
            createElement("span", "incident-title", String(incident.title || "Incident")),
            createElement("span", "incident-status", String(incident.status || "active").replaceAll("_", " "))
          );
          incidentListElement.append(row);
        }
        incidentsElement.hidden = incidentListElement.childElementCount === 0;
      }

      function renderResult(result) {
        const data = result && result.structuredContent;
        if (!data || typeof data !== "object") {
          setBusy(false);
          setError("Couldn’t load team health.");
          return;
        }
        const severe = numeric(data.down) + numeric(data.critical) + numeric(data.openIncidents);
        const warning = numeric(data.warning) + numeric(data.pending) + numeric(data.breachedObjectives);
        const monitorCount = numeric(data.checks) + numeric(data.heartbeats);
        const pausedOnly = monitorCount > 0 && numeric(data.passing) === 0 && numeric(data.paused) > 0;
        const tone = severe > 0 ? "danger" : warning > 0 || pausedOnly ? "warning" : monitorCount > 0 ? "success" : "neutral";
        const statusLabel = severe > 0
          ? "Needs attention"
          : warning > 0
            ? "Degraded"
            : pausedOnly
              ? "Paused"
              : monitorCount > 0
                ? "Healthy"
                : "No monitors";
        stateElement.dataset.tone = tone;
        stateLabelElement.textContent = statusLabel;
        renderMetrics(data);
        renderBreakdown(data);
        renderIncidents(data);
        setError("");
        setBusy(false);
      }

      async function refresh() {
        if (!teamId || !canCallServerTools || refreshing || destroyed) return;
        setBusy(true);
        setError("");
        try {
          const result = await sendRequest("tools/call", {
            name: "get_team_overview",
            arguments: { teamId },
          });
          renderResult(result);
        } catch {
          if (destroyed) return;
          setBusy(false);
          setError("Couldn’t refresh team health. Try again.");
        }
      }

      function receiveMessage(event) {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.jsonrpc !== "2.0") return;

        if (message.method === "ui/resource-teardown" && message.id !== undefined) {
          sendResponse(message.id, {});
          teardown();
          return;
        }

        if (message.method === undefined && message.id !== undefined) {
          const pending = pendingRequests.get(message.id);
          if (!pending) return;
          if (!("result" in message) && !("error" in message)) return;
          pendingRequests.delete(message.id);
          clearTimeout(pending.timeout);
          if ("error" in message) pending.reject(message.error);
          else pending.resolve(message.result);
          return;
        }

        if (message.method === "ui/notifications/tool-input") {
          const argumentsValue = message.params && message.params.arguments;
          if (argumentsValue && typeof argumentsValue.teamId === "string") {
            teamId = argumentsValue.teamId;
            setBusy(refreshing);
          }
          return;
        }

        if (message.method === "ui/notifications/tool-result") {
          renderResult(message.params);
          return;
        }

        if (message.method === "ui/notifications/tool-cancelled") {
          setBusy(false);
          setError("Request cancelled.");
          return;
        }

        if (message.method === "ui/notifications/host-context-changed") {
          applyHostContext(message.params);
        }
      }

      window.addEventListener("message", receiveMessage, { passive: true });
      refreshElement.addEventListener("click", refresh);

      async function initialize() {
        try {
          const result = await sendRequest("ui/initialize", {
            appInfo: { name: "mimorii-team-health", version: appVersion },
            appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
            protocolVersion: "2026-01-26",
          });
          applyHostContext(result && result.hostContext);
          canCallServerTools = Boolean(
            result && result.hostCapabilities && result.hostCapabilities.serverTools
          );
          refreshElement.hidden = !canCallServerTools;
          setBusy(false);
          sendNotification("ui/notifications/initialized", {});
          bridgeInitialized = true;
          reportSize();
          if (typeof ResizeObserver === "function") {
            resizeObserver = new ResizeObserver(reportSize);
            resizeObserver.observe(document.body);
          }
        } catch {
          if (destroyed) return;
          stateLabelElement.textContent = "Unavailable";
          setError("Couldn’t load this view.");
        }
      }

      initialize();
    </script>
  </body>
</html>`;
