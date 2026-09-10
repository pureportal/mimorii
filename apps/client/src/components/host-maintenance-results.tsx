import type { CheckSummary } from "@mimorii/contracts";
import { hostMaintenanceFindings } from "../lib/host-maintenance";
import { cn } from "../lib/cn";

export function HostMaintenanceResults({ metrics }: { metrics: CheckSummary["latestMetrics"] }) {
  const findings = hostMaintenanceFindings(metrics);
  if (!findings.length) return null;
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Maintenance</h3>
      <dl className="divide-y divide-line rounded-2xl border border-line px-4">
        {findings.map((finding) => (
          <div key={finding.key} className="py-3">
            <dt className="flex items-center justify-between gap-4 text-sm font-medium">
              {finding.label}
              <span
                className={cn(
                  "text-xs",
                  finding.status === "critical"
                    ? "text-danger"
                    : finding.status === "okay"
                      ? "text-muted"
                      : "text-warning-strong"
                )}
              >
                {finding.status === "okay"
                  ? "Okay"
                  : finding.status === "critical"
                    ? "Critical"
                    : finding.status === "warning"
                      ? "Warning"
                      : "Unavailable"}
              </span>
            </dt>
            {finding.detail ? (
              <dd className="mt-1 break-words text-sm text-muted">
                {finding.detail.replace(/^Unavailable: /, "")}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
