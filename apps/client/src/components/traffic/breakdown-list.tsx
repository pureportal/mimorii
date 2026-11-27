import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "../ui/card";

export interface BreakdownItem {
  key: string;
  label: ReactNode;
  value: number;
  detail?: string;
}

export function BreakdownList({
  title,
  items,
  valueLabel = "Visitors",
}: {
  title: string;
  items: BreakdownItem[];
  valueLabel?: string;
}) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  return (
    <Card>
      <CardHeader>
        <h3 className="font-display font-bold">{title}</h3>
        <span className="text-xs text-muted">{valueLabel}</span>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.key} className="relative overflow-hidden rounded-lg px-2.5 py-1.5">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-lg bg-lavender-soft"
                  style={{ width: `${(item.value / maximum) * 100}%` }}
                />
                <span className="relative flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{item.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {item.value.toLocaleString()}
                    {item.detail ? (
                      <span className="ml-2 text-xs font-normal text-muted">{item.detail}</span>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="grid h-24 place-items-center text-sm text-muted">No data</p>
        )}
      </CardContent>
    </Card>
  );
}
