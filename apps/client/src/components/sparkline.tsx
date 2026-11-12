import { cn } from "../lib/cn";

const height = 28;
const padding = 3;

export function Sparkline({
  values,
  domain,
  className,
}: {
  values: Array<number | null>;
  domain?: [number, number];
  className?: string;
}) {
  const present = values.filter((value): value is number => value !== null);
  if (present.length < 2) return null;
  const [low, high] = domain ?? [Math.min(...present), Math.max(...present)];
  const span = high - low || 1;
  const x = (index: number) => (index / (values.length - 1)) * 100;
  const y = (value: number) =>
    height -
    padding -
    ((Math.min(Math.max(value, low), high) - low) / span) * (height - 2 * padding);
  const points = values.flatMap((value, index) =>
    value === null ? [] : [`${x(index)},${y(value)}`]
  );
  const lastIndex = values.findLastIndex((value) => value !== null);
  const lastValue = values[lastIndex]!;

  return (
    <div className={cn("relative h-7", className)} aria-hidden="true">
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="size-full overflow-visible"
      >
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="var(--color-muted)"
          strokeOpacity={0.55}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lavender ring-2 ring-surface"
        style={{ left: `${x(lastIndex)}%`, top: `${(y(lastValue) / height) * 100}%` }}
      />
    </div>
  );
}
