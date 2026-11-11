import {
  escapeLogRegex,
  logPatternPlaceholder,
  type LogLevel,
  type LogPattern,
} from "@mimorii/contracts";

export interface PatternSample {
  message: string;
  level: LogLevel;
  timestamp: number;
}

interface PatternCluster {
  tokens: string[];
  count: number;
  levels: Partial<Record<LogLevel, number>>;
  first: number;
  last: number;
  sample: string;
  times: number[];
}

const placeholder = logPatternPlaceholder;
const maximumLineLength = 1_000;
const similarityThreshold = 0.6;
const repeatedPlaceholders = new RegExp(`(?:${escapeLogRegex(placeholder)})+`, "g");
const jsonValue =
  /("((?:[^"\\]|\\.){1,100})"\s*:\s*)("(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false|null)/g;
const readableJsonKeys = new Set([
  "msg",
  "message",
  "level",
  "lvl",
  "severity",
  "event",
  "error",
  "err",
  "logger",
  "method",
  "route",
]);
const maskers: Array<[RegExp, string]> = [
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, placeholder],
  [/\b\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?\b/g, placeholder],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, placeholder],
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, placeholder],
  [/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, placeholder],
  [/\b0x[0-9a-f]+\b/gi, placeholder],
  [/\b(?=[0-9a-f]*\d)[0-9a-f]{12,}\b/gi, placeholder],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g, placeholder],
  [/(?<![A-Za-z])-?\d+(?:\.\d+)?(?:ms|us|µs|ns|s|m|h|d|kb|mb|gb|b|%)?(?![A-Za-z])/gi, placeholder],
];

export function maskLogLine(message: string): string[] {
  let masked = message
    .slice(0, maximumLineLength)
    .replace(jsonValue, (match: string, prefix: string, key: string) =>
      readableJsonKeys.has(key) ? match : `${prefix}${placeholder}`
    );
  for (const [pattern, replacement] of maskers) masked = masked.replace(pattern, replacement);
  return masked.replace(repeatedPlaceholders, placeholder).split(/\s+/).filter(Boolean);
}

export function extractLogPatterns(
  samples: PatternSample[],
  window: { from: number; to: number },
  options: { limit: number; trendBuckets: number }
): LogPattern[] {
  const exact = new Map<string, PatternCluster>();
  for (const sample of samples) {
    const tokens = maskLogLine(sample.message);
    const key = tokens.join(" ");
    const cluster = exact.get(key) ?? {
      tokens,
      count: 0,
      levels: {},
      first: sample.timestamp,
      last: sample.timestamp,
      sample: sample.message.slice(0, 500),
      times: [],
    };
    cluster.count += 1;
    cluster.levels[sample.level] = (cluster.levels[sample.level] ?? 0) + 1;
    cluster.first = Math.min(cluster.first, sample.timestamp);
    cluster.last = Math.max(cluster.last, sample.timestamp);
    cluster.times.push(sample.timestamp);
    exact.set(key, cluster);
  }

  const merged = new Map<number, PatternCluster[]>();
  for (const cluster of [...exact.values()].sort((left, right) => right.count - left.count)) {
    const bucket = merged.get(cluster.tokens.length) ?? [];
    const target = bucket.find((candidate) => similar(candidate.tokens, cluster.tokens));
    if (target) absorb(target, cluster);
    else bucket.push(cluster);
    merged.set(cluster.tokens.length, bucket);
  }

  const span = Math.max(1, window.to - window.from);
  return [...merged.values()]
    .flat()
    .sort((left, right) => right.count - left.count)
    .slice(0, options.limit)
    .map((cluster) => {
      const trend = Array.from({ length: options.trendBuckets }, () => 0);
      for (const time of cluster.times) {
        const position = Math.floor(((time - window.from) / span) * options.trendBuckets);
        const index = Math.min(options.trendBuckets - 1, Math.max(0, position));
        trend[index] = (trend[index] ?? 0) + 1;
      }
      return {
        pattern: cluster.tokens.join(" "),
        count: cluster.count,
        levels: cluster.levels,
        firstSeen: new Date(cluster.first).toISOString(),
        lastSeen: new Date(cluster.last).toISOString(),
        sample: cluster.sample,
        trend,
      };
    });
}

function similar(left: string[], right: string[]): boolean {
  if (!left.length || left[0] !== right[0]) return left.length === 0 && right.length === 0;
  let equal = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) equal += 1;
  }
  return equal / left.length >= similarityThreshold;
}

function absorb(target: PatternCluster, source: PatternCluster): void {
  target.tokens = target.tokens.map((token, index) =>
    token === source.tokens[index] ? token : placeholder
  );
  target.count += source.count;
  for (const [level, count] of Object.entries(source.levels) as Array<[LogLevel, number]>) {
    target.levels[level] = (target.levels[level] ?? 0) + count;
  }
  target.first = Math.min(target.first, source.first);
  target.last = Math.max(target.last, source.last);
  target.times.push(...source.times);
}
