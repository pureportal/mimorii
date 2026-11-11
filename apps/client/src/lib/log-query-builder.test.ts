import { describe, expect, it } from "vitest";
import {
  builderFromText,
  highlightExpressions,
  selectedLevels,
  textFromBuilder,
  withLabelMatcher,
  withToggledLevel,
} from "./log-query-builder";
import { dedupLogEntries } from "./log-display";
import { readLogTimeRange, resolveLogTimeRange, zoomOutLogTimeRange } from "./log-time-range";

describe("log query builder", () => {
  it("round-trips case-insensitive search, levels, and labels", () => {
    const text = textFromBuilder({
      matchers: [{ label: "service", operator: "=", value: "web" }],
      levels: ["warn", "error"],
      filters: [
        { mode: "contains", value: "Error 404 - Failed (to) load", matchCase: false },
        { mode: "notContains", value: "health", matchCase: true },
      ],
      fields: [{ field: "status", operator: ">=", value: 500 }],
    });

    expect(text).toBe(
      '{service="web", level=~"error|warn"} |~ "(?i)Error 404 - Failed \\\\(to\\\\) load" != "health" | status >= 500'
    );
    expect(builderFromText(text)).toEqual({
      matchers: [{ label: "service", operator: "=", value: "web" }],
      levels: ["error", "warn"],
      filters: [
        { mode: "contains", value: "Error 404 - Failed (to) load", matchCase: false },
        { mode: "notContains", value: "health", matchCase: true },
      ],
      fields: [{ field: "status", operator: ">=", value: 500 }],
    });
  });

  it("keeps real regular expressions as regex filters", () => {
    expect(builderFromText('|~ "(?i)status=5\\\\d\\\\d"').filters).toEqual([
      { mode: "regex", value: "(?i)status=5\\d\\d", matchCase: true },
    ]);
  });

  it("toggles levels and replaces label filters in the same direction", () => {
    const withError = withToggledLevel('{service="web"}', "error");
    expect(selectedLevels(withError)).toEqual(["error"]);
    expect(selectedLevels(withToggledLevel(withError, "error"))).toEqual([]);

    expect(
      withLabelMatcher('{service="web", env!="dev"}', {
        label: "service",
        operator: "=",
        value: "api",
      })
    ).toBe('{env!="dev", service="api"}');
  });

  it("highlights exact and case-insensitive matches", () => {
    const [exact, insensitive] = highlightExpressions('|= "Error" |~ "(?i)fail"');
    expect("Error FAIL".match(exact!)).toEqual(["Error"]);
    expect("Error FAIL".match(insensitive!)).toEqual(["FAIL"]);
  });
});

describe("log display and time ranges", () => {
  it("collapses consecutive duplicates", () => {
    const entry = (id: string, message: string) => ({
      id,
      streamId: "stream",
      timestamp: "2026-11-11T10:00:00.000Z",
      receivedAt: "2026-11-11T10:00:00.000Z",
      level: "info" as const,
      message,
      labels: {},
      attributes: {},
    });
    const entries = [entry("1", "took 12ms"), entry("2", "took 15ms"), entry("3", "done")];

    expect(dedupLogEntries(entries, "exact").map((item) => item.duplicates)).toEqual([0, 0, 0]);
    expect(dedupLogEntries(entries, "numbers").map((item) => item.duplicates)).toEqual([1, 0]);
  });

  it("reads relative and absolute ranges and falls back for invalid ones", () => {
    const now = Date.parse("2026-11-11T12:00:00.000Z");
    expect(readLogTimeRange(new URLSearchParams("from=now-15m&to=now"))).toEqual({
      from: "now-15m",
      to: "now",
    });
    expect(resolveLogTimeRange({ from: "now-2h", to: "now" }, now).from.toISOString()).toBe(
      "2026-11-11T10:00:00.000Z"
    );
    expect(readLogTimeRange(new URLSearchParams("from=later&to=now"))).toEqual({
      from: "now-1h",
      to: "now",
    });
    const zoomed = zoomOutLogTimeRange({
      from: "2026-11-11T10:00:00.000Z",
      to: "2026-11-11T11:00:00.000Z",
    });
    expect(Date.parse(zoomed.to) - Date.parse(zoomed.from)).toBe(2 * 3_600_000);
  });
});
