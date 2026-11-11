import type { LogAlertComparison } from "@mimorii/contracts";

export function formatLogAlertWindow(seconds: number): string {
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export function formatLogAlertCondition(
  comparison: LogAlertComparison,
  threshold: number,
  windowSeconds: number
): string {
  const count = threshold.toLocaleString();
  const window = formatLogAlertWindow(windowSeconds);
  return comparison === "atLeast"
    ? `${count} or more matching lines in ${window}`
    : `Fewer than ${count} matching ${threshold === 1 ? "line" : "lines"} in ${window}`;
}
