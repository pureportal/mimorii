import type { CheckSummary } from "@mimorii/contracts";

export interface ExpiringCheck {
  check: CheckSummary;
  subject: "Certificate" | "Domain";
  daysRemaining: number;
}

const defaultWarningDays = 30;

export function expiringChecks(checks: CheckSummary[]): ExpiringCheck[] {
  return checks
    .flatMap((check): ExpiringCheck[] => {
      if (!check.enabled) return [];
      const expiryWarningDays =
        "expiryWarningDays" in check.config ? check.config.expiryWarningDays : undefined;
      const certificateWarningDays =
        "certificateWarningDays" in check.config ? check.config.certificateWarningDays : undefined;
      const certificate = check.latestMetrics.certificateDaysRemaining;
      const domain = check.latestMetrics.domainDaysRemaining;
      if (typeof domain === "number" && domain <= (expiryWarningDays ?? defaultWarningDays)) {
        return [{ check, subject: "Domain", daysRemaining: domain }];
      }
      if (
        typeof certificate === "number" &&
        certificate <= (certificateWarningDays ?? defaultWarningDays)
      ) {
        return [{ check, subject: "Certificate", daysRemaining: certificate }];
      }
      return [];
    })
    .toSorted((left, right) => left.daysRemaining - right.daysRemaining);
}
