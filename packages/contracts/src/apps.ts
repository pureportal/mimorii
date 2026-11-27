import type { IncidentImpact, ResourceSummary } from "./index.js";

export const appKinds = ["foxytail", "machdoch-cloud", "lifie"] as const;
export type AppKind = (typeof appKinds)[number];

export type AppMetricFormat = "count" | "bytes" | "availability" | "text";

export interface AppMetricDefinition {
  key: string;
  label: string;
  format: AppMetricFormat;
  attentionWhenPositive?: boolean;
  highlight?: boolean;
}

export interface AppMetricGroup {
  title: string;
  metrics: readonly AppMetricDefinition[];
}

export interface AppLogAlertDefinition {
  name: string;
  query: string;
  windowSeconds: number;
  threshold: number;
  impact: IncidentImpact;
  autoResolve: boolean;
}

export interface AppDefinition {
  kind: AppKind;
  name: string;
  address: { label: string; required: boolean; placeholder: string } | null;
  healthCheck: { path: string; json: { pointer: string; equals: string } | null } | null;
  heartbeat: { intervalSeconds: number; graceSeconds: number; enabledByApp: boolean } | null;
  logSource: { labels: Readonly<Record<string, string>> } | null;
  connectIn: string | null;
  logAlerts: readonly AppLogAlertDefinition[];
  metricGroups: readonly AppMetricGroup[];
}

const count = (
  key: string,
  label: string,
  options: Pick<AppMetricDefinition, "attentionWhenPositive" | "highlight"> = {}
): AppMetricDefinition => ({ key, label, format: "count", ...options });

const attention = (key: string, label: string, highlight = false) =>
  count(key, label, { attentionWhenPositive: true, highlight });

export const appDefinitions: Readonly<Record<AppKind, AppDefinition>> = {
  foxytail: {
    kind: "foxytail",
    name: "Foxytail",
    address: { label: "Server address", required: false, placeholder: "https://media.example.com" },
    healthCheck: { path: "/health/ready", json: null },
    heartbeat: { intervalSeconds: 60, graceSeconds: 120, enabledByApp: true },
    logSource: null,
    connectIn: "Foxytail → Settings → Monitoring",
    logAlerts: [],
    metricGroups: [
      {
        title: "Health",
        metrics: [
          { key: "database", label: "Database", format: "availability", highlight: true },
          { key: "redis", label: "Redis", format: "availability", highlight: true },
          count("integrationsEnabled", "Enabled integrations"),
          { key: "version", label: "Version", format: "text", highlight: true },
        ],
      },
      {
        title: "Library",
        metrics: [
          count("libraries", "Libraries"),
          count("movies", "Movies", { highlight: true }),
          count("movieEditions", "Movie editions"),
          count("series", "Series", { highlight: true }),
          count("animeSeries", "Anime series"),
          count("seasons", "Seasons"),
          count("episodes", "Episodes"),
          count("artists", "Music artists"),
          count("albums", "Music albums"),
          count("tracks", "Music tracks"),
        ],
      },
      {
        title: "Storage",
        metrics: [
          count("mediaFiles", "Media files"),
          attention("unavailableFiles", "Unavailable media files", true),
          { key: "mediaBytes", label: "Library size", format: "bytes", highlight: true },
        ],
      },
      {
        title: "Activity",
        metrics: [
          count("accounts", "Accounts"),
          count("profiles", "Profiles"),
          count("activeSessions", "Active sign-ins"),
          count("playbackSessions", "Open playback sessions", { highlight: true }),
        ],
      },
      {
        title: "Requests",
        metrics: [
          count("requestsPending", "Pending requests", { highlight: true }),
          attention("requestsAttention", "Requests needing attention"),
        ],
      },
      {
        title: "Downloads",
        metrics: [
          count("downloadsQueued", "Queued", { highlight: true }),
          count("downloadsActive", "Downloading", { highlight: true }),
          count("downloadsPaused", "Paused"),
          count("downloadsProcessing", "Post-processing"),
          attention("downloadsFailed", "Failed downloads", true),
          attention("downloadsAttention", "Need attention"),
          attention("downloadsMissing", "Missing"),
          attention("downloadsStale", "Updates overdue"),
          count("importsPending", "Pending imports"),
          attention("importsAttention", "Imports needing attention"),
          attention("downloaderSyncFailures", "Downloader sync failures"),
          count("downloadCompletions24h", "Completed in 24 hours"),
          attention("downloadFailures24h", "Failed in 24 hours"),
        ],
      },
      {
        title: "Processing",
        metrics: [
          count("jobsQueued", "Ready jobs"),
          count("jobsRunning", "Running jobs"),
          count("jobsRetrying", "Retrying jobs"),
          attention("jobsFailed", "Failed jobs", true),
          attention("jobsStalled", "Stalled jobs"),
          attention("scansFailed", "Failed scans"),
          attention("transcodesFailed", "Failed transcodes"),
          attention("libraryFoldersUnavailable", "Unavailable library folders", true),
        ],
      },
    ],
  },
  "machdoch-cloud": {
    kind: "machdoch-cloud",
    name: "Machdoch",
    address: { label: "Cloud address", required: false, placeholder: "https://cloud.example.com" },
    healthCheck: { path: "/healthz", json: null },
    heartbeat: null,
    logSource: { labels: { service: "machdoch-cloud" } },
    connectIn: "Machdoch Cloud → Settings → Mimorii",
    logAlerts: [
      {
        name: "Desktop app disconnected",
        query: '{service="machdoch-cloud", activity="client"} |= "Client disconnected"',
        windowSeconds: 600,
        threshold: 1,
        impact: "minor",
        autoResolve: false,
      },
      {
        name: "Errors",
        query: '{service="machdoch-cloud", level="error"}',
        windowSeconds: 900,
        threshold: 1,
        impact: "major",
        autoResolve: true,
      },
    ],
    metricGroups: [],
  },
  lifie: {
    kind: "lifie",
    name: "Lifie",
    address: { label: "API address", required: true, placeholder: "https://api.lifie.example.com" },
    healthCheck: { path: "/health", json: { pointer: "/status", equals: "ok" } },
    heartbeat: null,
    logSource: null,
    connectIn: null,
    logAlerts: [],
    metricGroups: [],
  },
};

export interface CreateAppInput {
  kind: AppKind;
  name: string;
  address?: string;
}

export interface CreatedApp {
  resource: ResourceSummary;
  enrollmentCode: string | null;
  logToken: string | null;
}
