import type { HeartbeatEventSummary } from "@mimorii/contracts";
import { useState } from "react";

export function FoxytailReportDetails({
  metadata,
  latest,
}: {
  metadata: HeartbeatEventSummary["metadata"];
  latest: boolean;
}) {
  const [expanded, setExpanded] = useState(latest);
  return (
    <details
      className="mt-2"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="mb-3 cursor-pointer text-xs font-semibold">Foxytail details</summary>
      {expanded && <FoxytailReport metadata={metadata} />}
    </details>
  );
}

const groups = [
  {
    title: "Library",
    metrics: [
      ["libraries", "Libraries"],
      ["movies", "Movies"],
      ["movieEditions", "Movie editions"],
      ["series", "Series"],
      ["animeSeries", "Anime series"],
      ["seasons", "Seasons"],
      ["episodes", "Episodes"],
      ["artists", "Music artists"],
      ["albums", "Music albums"],
      ["tracks", "Music tracks"],
    ],
  },
  {
    title: "Storage",
    metrics: [
      ["mediaFiles", "Media files"],
      ["unavailableFiles", "Unavailable media files"],
      ["mediaBytes", "Media size (bytes)"],
    ],
  },
  {
    title: "Activity",
    metrics: [
      ["accounts", "Accounts"],
      ["profiles", "Profiles"],
      ["activeSessions", "Active sign-ins"],
      ["playbackSessions", "Open playback sessions"],
    ],
  },
  {
    title: "Requests",
    metrics: [
      ["requestsPending", "Pending requests"],
      ["requestsAttention", "Requests needing attention"],
    ],
  },
  { title: "Health", metrics: [["integrationsEnabled", "Enabled integrations"]] },
  {
    title: "Downloads",
    metrics: [
      ["downloadsQueued", "Queued"],
      ["downloadsActive", "Downloading"],
      ["downloadsPaused", "Paused"],
      ["downloadsProcessing", "Post-processing"],
      ["downloadsFailed", "Failed downloads"],
      ["downloadsAttention", "Need attention"],
      ["downloadsMissing", "Missing"],
      ["downloadsStale", "Updates overdue"],
      ["importsPending", "Pending imports"],
      ["importsAttention", "Imports needing attention"],
      ["downloaderSyncFailures", "Downloader sync failures"],
    ],
  },
  {
    title: "Last 24 hours",
    metrics: [
      ["downloadCompletions24h", "Download completions"],
      ["downloadFailures24h", "Download failures"],
    ],
  },
  {
    title: "Processing",
    metrics: [
      ["jobsQueued", "Ready jobs"],
      ["jobsRunning", "Running jobs"],
      ["jobsRetrying", "Retrying jobs"],
      ["jobsFailed", "Failed jobs"],
      ["jobsStalled", "Stalled jobs"],
      ["scansFailed", "Failed scans"],
      ["transcodesFailed", "Failed transcodes"],
      ["libraryFoldersUnavailable", "Unavailable library folders"],
    ],
  },
] as const;

export function FoxytailReport({ metadata }: { metadata: HeartbeatEventSummary["metadata"] }) {
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-2 text-xs">
        {(
          [
            ["database", "Database"],
            ["redis", "Redis"],
          ] as const
        ).map(
          ([key, label]) =>
            typeof metadata[key] === "boolean" && (
              <div key={key}>
                <dt className="text-muted">{label}</dt>
                <dd className="font-semibold">{metadata[key] ? "Available" : "Unavailable"}</dd>
              </div>
            )
        )}
      </dl>
      {groups.map((group) => {
        const metrics = group.metrics.filter(
          ([key]) =>
            metadata[key] === null ||
            (typeof metadata[key] === "number" &&
              Number.isSafeInteger(metadata[key]) &&
              Number(metadata[key]) >= 0)
        );
        if (!metrics.length) return null;
        return (
          <section key={group.title}>
            <h4 className="mb-2 text-xs font-semibold">{group.title}</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {metrics.map(([key, label]) => (
                <div key={key}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-semibold tabular-nums">
                    {metadata[key] === null
                      ? "Unavailable"
                      : Number(metadata[key]).toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      {typeof metadata.version === "string" && (
        <p className="text-xs text-muted">Foxytail {metadata.version}</p>
      )}
      {typeof metadata.serverId === "string" && (
        <p className="break-all text-xs text-muted">Server ID: {metadata.serverId}</p>
      )}
    </div>
  );
}
