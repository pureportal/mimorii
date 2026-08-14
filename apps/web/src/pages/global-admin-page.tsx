import type { GlobalAdminStatistics } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { AdminAudit } from "../components/admin/admin-audit";
import { AdminSettings } from "../components/admin/admin-settings";
import { AdminSponsorships } from "../components/admin/admin-sponsorships";
import { AdminUsers } from "../components/admin/admin-users";
import { ErrorState, LoadingState } from "../components/page-state";
import { SectionTabs } from "../components/section-tabs";
import { Card, CardContent } from "../components/ui/card";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";

export type PlatformSection = "overview" | "users" | "sponsorships" | "settings" | "audit";

const sections = [
  { label: "Overview", to: appRoutes.platform },
  { label: "Users", to: appRoutes.platformUsers },
  { label: "Sponsorships", to: appRoutes.platformSponsorships },
  { label: "Settings", to: appRoutes.platformSettings },
  { label: "Audit log", to: appRoutes.platformAudit },
] as const;

export function GlobalAdminPage({ section }: { section: PlatformSection }) {
  const statistics = useQuery({
    queryKey: ["global-admin", "statistics"],
    queryFn: () => api<GlobalAdminStatistics>("/admin/statistics"),
    enabled: section === "overview",
  });

  if (section === "overview" && statistics.isLoading) return <LoadingState />;
  if (section === "overview" && statistics.isError) {
    return <ErrorState retry={() => void statistics.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div data-guide-page="platform-tabs" className="lg:hidden">
        <SectionTabs label="Platform administration" items={sections} />
      </div>
      <div data-guide-page="platform-content">
        {section === "overview" && statistics.data ? (
          <PlatformOverview statistics={statistics.data} />
        ) : null}
        {section === "users" ? <AdminUsers /> : null}
        {section === "sponsorships" ? <AdminSponsorships /> : null}
        {section === "settings" ? <AdminSettings /> : null}
        {section === "audit" ? <AdminAudit /> : null}
      </div>
    </div>
  );
}

function PlatformOverview({ statistics }: { statistics: GlobalAdminStatistics }) {
  const registrations30d = statistics.registrations.reduce((total, item) => total + item.count, 0);
  const cards = [
    {
      label: "Accounts",
      value: statistics.totalUsers,
      detail: `${statistics.enabledUsers} enabled · ${statistics.disabledUsers} disabled · ${statistics.globalAdministrators} administrators`,
    },
    { label: "New accounts (30d)", value: registrations30d },
    { label: "Signed in (30d)", value: statistics.signedInUsers30d },
    { label: "Teams", value: statistics.teams },
    { label: "Resources", value: statistics.resources },
    { label: "Checks", value: statistics.checks },
    { label: "Open incidents", value: statistics.openIncidents },
    {
      label: "Pending applications",
      value: statistics.pendingSponsorshipApplications,
      detail: `${statistics.publishedSponsors} published sponsors`,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="pt-5">
            <p className="text-xs font-semibold text-muted">{card.label}</p>
            <p className="mt-2 font-display text-3xl font-black">{card.value.toLocaleString()}</p>
            {card.detail ? <p className="mt-1 text-xs text-muted">{card.detail}</p> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
