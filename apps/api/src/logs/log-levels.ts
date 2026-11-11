import type { LogLevel } from "@mimorii/contracts";

const levelAliases: Record<string, LogLevel> = {
  fatal: "fatal",
  panic: "fatal",
  critical: "fatal",
  crit: "fatal",
  emerg: "fatal",
  emergency: "fatal",
  alert: "fatal",
  error: "error",
  err: "error",
  eror: "error",
  warn: "warn",
  warning: "warn",
  wrn: "warn",
  info: "info",
  inf: "info",
  information: "info",
  informational: "info",
  notice: "info",
  debug: "debug",
  dbg: "debug",
  trace: "trace",
  trc: "trace",
  verbose: "trace",
};

const levelKeywordPattern =
  /\b(fatal|panic|critical|crit|emerg|error|err|warn|warning|info|notice|debug|dbg|trace)\b/i;
const structuredLevelPattern =
  /(?:^|[\s{,])"?(?:level|lvl|severity|loglevel|log_level)"?\s*[:=]\s*"?([A-Za-z]+)/i;

export function normalizeLogLevel(value: string | undefined): LogLevel | undefined {
  if (!value) return undefined;
  return levelAliases[value.trim().toLowerCase()];
}

export function detectLogLevel(message: string, ...hints: Array<string | undefined>): LogLevel {
  for (const hint of hints) {
    const level = normalizeLogLevel(hint);
    if (level) return level;
  }
  const head = message.slice(0, 512);
  const structured = normalizeLogLevel(structuredLevelPattern.exec(head)?.[1]);
  if (structured) return structured;
  return normalizeLogLevel(levelKeywordPattern.exec(head)?.[1]) ?? "unknown";
}

export function otlpSeverityLevel(severityNumber: number | undefined): LogLevel | undefined {
  if (!severityNumber || severityNumber < 1 || severityNumber > 24) return undefined;
  const levels: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];
  return levels[Math.floor((severityNumber - 1) / 4)];
}
