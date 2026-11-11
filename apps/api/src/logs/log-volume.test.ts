import { describe, expect, it } from "vitest";
import {
  assembleLogVolume,
  logVolumeSql,
  logVolumeStep,
  type LogVolumeFilters,
} from "./log-volume.js";

const filters: LogVolumeFilters = {
  teamId: "team-1",
  streams: (column) => ({ clauses: [`${column} IN (?)`], parameters: [["stream-1"]] }),
  rollupLevels: { clauses: ["v.level = ?"], parameters: ["error"] },
  entries: { clauses: ["e.level = ?"], parameters: ["error"] },
};

describe("log volume", () => {
  it("reads whole rollup buckets and counts only the partial edges from raw entries", () => {
    const window = {
      from: new Date("2026-11-04T10:20:00.000Z"),
      to: new Date("2026-11-11T10:20:00.000Z"),
    };
    const step = logVolumeStep(window);
    expect(step).toBe(7_200);

    const volume = logVolumeSql(window, step, filters, true);
    expect(volume.sql).toContain("FROM log_volume v");
    expect(volume.sql).toContain("UNION ALL");
    expect(volume.parameters).toEqual([
      7_200,
      7_200,
      "team-1",
      3_600,
      "2026-11-04T11:00:00.000Z",
      "2026-11-11T10:00:00.000Z",
      ["stream-1"],
      "error",
      7_200,
      7_200,
      "team-1",
      "2026-11-04T10:20:00.000Z",
      "2026-11-04T11:00:00.000Z",
      "2026-11-11T10:00:00.000Z",
      "2026-11-11T10:20:00.000Z",
      ["stream-1"],
      "error",
    ]);
  });

  it("uses five-minute rollups for daily ranges and raw entries for short or filtered ranges", () => {
    const day = {
      from: new Date("2026-11-10T10:00:00.000Z"),
      to: new Date("2026-11-11T10:00:00.000Z"),
    };
    expect(logVolumeSql(day, logVolumeStep(day), filters, true).parameters[3]).toBe(300);

    const hour = {
      from: new Date("2026-11-11T09:00:00.000Z"),
      to: new Date("2026-11-11T10:00:00.000Z"),
    };
    expect(logVolumeStep(hour)).toBe(30);
    expect(logVolumeSql(hour, 30, filters, true).sql).not.toContain("log_volume");
    expect(logVolumeSql(day, logVolumeStep(day), filters, false).sql).not.toContain("log_volume");
  });

  it("fills empty buckets and totals counts by level", () => {
    const window = {
      from: new Date("2026-11-11T09:00:00.000Z"),
      to: new Date("2026-11-11T09:01:00.000Z"),
    };
    const volume = assembleLogVolume(window, 30, [
      { bucket: Date.parse("2026-11-11T09:00:30.000Z") / 1_000, level: "error", count: 2 },
      { bucket: Date.parse("2026-11-11T09:00:30.000Z") / 1_000, level: "info", count: 3 },
    ]);
    expect(volume.total).toBe(5);
    expect(volume.levels).toEqual({ error: 2, info: 3 });
    expect(volume.buckets.map((bucket) => bucket.total)).toEqual([0, 5, 0]);
  });
});
