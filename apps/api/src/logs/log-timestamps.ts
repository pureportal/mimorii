const fractionPattern = /T?\d{2}:\d{2}:\d{2}[.,](\d+)/;
const zonePattern = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function isoToMicros(value: string): number | null {
  const spaced = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2");
  const normalized =
    /T\d{2}:\d{2}/.test(spaced) && !zonePattern.test(spaced) ? `${spaced}Z` : spaced;
  const milliseconds = Date.parse(normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d)/, "$1.$2"));
  if (!Number.isFinite(milliseconds)) return null;
  const fraction = fractionPattern.exec(normalized)?.[1] ?? "";
  const extraMicros = fraction.length > 3 ? Number(fraction.slice(3, 6).padEnd(3, "0")) : 0;
  return milliseconds * 1_000 + extraMicros;
}

export function epochNumberToMicros(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const magnitude = Math.abs(value);
  if (magnitude < 1e11) return Math.round(value * 1_000_000);
  if (magnitude < 1e14) return Math.round(value * 1_000);
  if (magnitude < 1e17) return Math.round(value);
  return Math.round(value / 1_000);
}

export function nanosecondsToMicros(value: string | bigint): number | null {
  const nanoseconds = typeof value === "bigint" ? value : parseNanoseconds(value);
  if (nanoseconds === null || nanoseconds <= 0n) return null;
  return Number(nanoseconds / 1_000n);
}

export function microsToIso(micros: number): string {
  const milliseconds = Math.floor(micros / 1_000);
  const remainder = String(micros - milliseconds * 1_000).padStart(3, "0");
  return `${new Date(milliseconds).toISOString().slice(0, -1)}${remainder}Z`;
}

function parseNanoseconds(value: string): bigint | null {
  return /^\d{1,20}$/.test(value) ? BigInt(value) : null;
}
