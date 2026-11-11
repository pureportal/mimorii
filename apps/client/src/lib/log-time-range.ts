export interface LogTimeRange {
  from: string;
  to: string;
}

export interface ResolvedLogTimeRange {
  from: Date;
  to: Date;
}

export const defaultLogTimeRange: LogTimeRange = { from: "now-1h", to: "now" };

export const quickLogTimeRanges = [
  { label: "Last 5 minutes", from: "now-5m" },
  { label: "Last 15 minutes", from: "now-15m" },
  { label: "Last 30 minutes", from: "now-30m" },
  { label: "Last 1 hour", from: "now-1h" },
  { label: "Last 3 hours", from: "now-3h" },
  { label: "Last 6 hours", from: "now-6h" },
  { label: "Last 12 hours", from: "now-12h" },
  { label: "Last 24 hours", from: "now-24h" },
  { label: "Last 2 days", from: "now-2d" },
  { label: "Last 7 days", from: "now-7d" },
  { label: "Last 14 days", from: "now-14d" },
  { label: "Last 30 days", from: "now-30d" },
] as const;

const relativePattern = /^now(?:-(\d{1,4})([smhd]))?$/;
const unitMilliseconds = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
const maximumRangeMilliseconds = 90 * 86_400_000;

export function readLogTimeRange(search: URLSearchParams): LogTimeRange {
  const range = { from: search.get("from") ?? "", to: search.get("to") ?? "" };
  if (!isValidTime(range.from) || !isValidTime(range.to)) return defaultLogTimeRange;
  const resolved = resolveLogTimeRange(range);
  const span = resolved.to.getTime() - resolved.from.getTime();
  return span > 0 && span <= maximumRangeMilliseconds ? range : defaultLogTimeRange;
}

export function resolveLogTimeRange(range: LogTimeRange, now = Date.now()): ResolvedLogTimeRange {
  return { from: resolveTime(range.from, now), to: resolveTime(range.to, now) };
}

export function isRelativeLogTimeRange(range: LogTimeRange): boolean {
  return range.to === "now" && relativePattern.test(range.from);
}

export function describeLogTimeRange(range: LogTimeRange): string {
  const quick = quickLogTimeRanges.find(
    (candidate) => candidate.from === range.from && range.to === "now"
  );
  if (quick) return quick.label;
  const resolved = resolveLogTimeRange(range);
  return `${formatRangeEdge(resolved.from)} – ${formatRangeEdge(resolved.to)}`;
}

export function absoluteLogTimeRange(from: Date, to: Date): LogTimeRange {
  return { from: from.toISOString(), to: to.toISOString() };
}

export function shiftLogTimeRange(range: LogTimeRange, direction: -1 | 1): LogTimeRange {
  const resolved = resolveLogTimeRange(range);
  const span = resolved.to.getTime() - resolved.from.getTime();
  const offset = (span / 2) * direction;
  const to = Math.min(resolved.to.getTime() + offset, Date.now());
  return absoluteLogTimeRange(new Date(to - span), new Date(to));
}

export function zoomOutLogTimeRange(range: LogTimeRange): LogTimeRange {
  const resolved = resolveLogTimeRange(range);
  const span = resolved.to.getTime() - resolved.from.getTime();
  const nextSpan = Math.min(span * 2, maximumRangeMilliseconds);
  const center = resolved.from.getTime() + span / 2;
  const to = Math.min(center + nextSpan / 2, Date.now());
  return absoluteLogTimeRange(new Date(to - nextSpan), new Date(to));
}

export function toDateTimeLocal(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 19);
}

function resolveTime(value: string, now: number): Date {
  const relative = relativePattern.exec(value);
  if (!relative) return new Date(value);
  const amount = Number(relative[1] ?? 0);
  const unit = (relative[2] ?? "s") as keyof typeof unitMilliseconds;
  return new Date(now - amount * unitMilliseconds[unit]);
}

function isValidTime(value: string): boolean {
  return relativePattern.test(value) || (value.length > 0 && Number.isFinite(Date.parse(value)));
}

function formatRangeEdge(value: Date): string {
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: value.getSeconds() ? "2-digit" : undefined,
  });
}
