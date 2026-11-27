import { describe, expect, it } from "vitest";
import { appHighlights, appMetricGroups } from "./app-metrics";

describe("app metrics", () => {
  it("highlights the key values of the latest app report", () => {
    expect(
      appHighlights("foxytail", {
        database: true,
        redis: false,
        version: "0.36.0",
        movies: 1200,
        downloadsActive: 2,
        downloadsFailed: 3,
        mediaBytes: 29_654_907_926_686,
        libraries: 4,
      })
    ).toEqual([
      { key: "database", label: "Database", value: "Available", tone: "success" },
      { key: "redis", label: "Redis", value: "Unavailable", tone: "danger" },
      { key: "version", label: "Version", value: "0.36.0" },
      { key: "movies", label: "Movies", value: "1,200" },
      { key: "mediaBytes", label: "Library size", value: "27.0 TB" },
      { key: "downloadsActive", label: "Downloading", value: "2" },
      { key: "downloadsFailed", label: "Failed downloads", value: "3", tone: "warning" },
    ]);
    expect(appHighlights("foxytail", {})).toEqual([]);
  });

  it("groups every reported metric and skips invalid values", () => {
    const groups = appMetricGroups("foxytail", { jobsFailed: 0, jobsRunning: -1, tracks: null });
    expect(groups).toEqual([
      { title: "Library", facts: [{ key: "tracks", label: "Music tracks", value: "Unavailable" }] },
      { title: "Processing", facts: [{ key: "jobsFailed", label: "Failed jobs", value: "0" }] },
    ]);
    expect(appMetricGroups("lifie", { anything: 1 })).toEqual([]);
  });
});
