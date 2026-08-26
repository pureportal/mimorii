import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoadingState } from "./components/page-state";
import { GlobalAdminRoute } from "./components/global-admin-route";
import { AndroidClientLayout } from "./components/android-client-layout";
import { PublicLayout } from "./components/public-layout";
import { appPaths } from "./lib/app-navigation";
import { applicationRuntime, startupPath, type ApplicationRuntime } from "./lib/runtime";

const ProtectedLayout = lazy(() =>
  import("./components/dashboard-layout").then((module) => ({
    default: module.ProtectedLayout,
  }))
);
const AgentsPage = lazy(() =>
  import("./pages/agents-page").then((module) => ({ default: module.AgentsPage }))
);
const AuthPage = lazy(() =>
  import("./pages/auth-page").then((module) => ({ default: module.AuthPage }))
);
const ChecksPage = lazy(() =>
  import("./pages/checks-page").then((module) => ({ default: module.ChecksPage }))
);
const HeartbeatsPage = lazy(() =>
  import("./pages/heartbeats-page").then((module) => ({ default: module.HeartbeatsPage }))
);
const InvitePage = lazy(() =>
  import("./pages/invite-page").then((module) => ({ default: module.InvitePage }))
);
const LandingPage = lazy(() =>
  import("./pages/landing-page").then((module) => ({ default: module.LandingPage }))
);
const OverviewPage = lazy(() =>
  import("./pages/overview-page").then((module) => ({ default: module.OverviewPage }))
);
const OperationsPage = lazy(() =>
  import("./pages/operations-page").then((module) => ({ default: module.OperationsPage }))
);
const AnalyticsPage = lazy(() =>
  import("./pages/analytics-page").then((module) => ({ default: module.AnalyticsPage }))
);
const ObjectivesPage = lazy(() =>
  import("./pages/objectives-page").then((module) => ({ default: module.ObjectivesPage }))
);
const NotificationsPage = lazy(() =>
  import("./pages/notifications-page").then((module) => ({ default: module.NotificationsPage }))
);
const StatusPagesPage = lazy(() =>
  import("./pages/status-pages-page").then((module) => ({ default: module.StatusPagesPage }))
);
const DashboardsPage = lazy(() =>
  import("./pages/dashboards-page").then((module) => ({ default: module.DashboardsPage }))
);
const DashboardEditorPage = lazy(() =>
  import("./pages/dashboard-editor-page").then((module) => ({
    default: module.DashboardEditorPage,
  }))
);
const DashboardViewPage = lazy(() =>
  import("./pages/dashboard-view-page").then((module) => ({ default: module.DashboardViewPage }))
);
const PublicStatusPageView = lazy(() =>
  import("./pages/public-status-page").then((module) => ({ default: module.PublicStatusPageView }))
);
const AuditPage = lazy(() =>
  import("./pages/audit-page").then((module) => ({ default: module.AuditPage }))
);
const ResourceDetailPage = lazy(() =>
  import("./pages/resource-detail-page").then((module) => ({
    default: module.ResourceDetailPage,
  }))
);
const ResourcesPage = lazy(() =>
  import("./pages/resources-page").then((module) => ({ default: module.ResourcesPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/settings-page").then((module) => ({ default: module.SettingsPage }))
);
const SponsorsPage = lazy(() =>
  import("./pages/sponsors-page").then((module) => ({ default: module.SponsorsPage }))
);
const TeamPage = lazy(() =>
  import("./pages/team-page").then((module) => ({ default: module.TeamPage }))
);
const GlobalAdminPage = lazy(() =>
  import("./pages/global-admin-page").then((module) => ({ default: module.GlobalAdminPage }))
);
const PrivacyPage = lazy(() =>
  import("./pages/legal/privacy-page").then((module) => ({ default: module.PrivacyPage }))
);
const TermsPage = lazy(() =>
  import("./pages/legal/terms-page").then((module) => ({ default: module.TermsPage }))
);
const ImprintPage = lazy(() =>
  import("./pages/legal/imprint-page").then((module) => ({ default: module.ImprintPage }))
);

export function App({ runtime = applicationRuntime }: { runtime?: ApplicationRuntime }) {
  const androidClient = runtime === "android-client";
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route element={androidClient ? <AndroidClientLayout /> : <PublicLayout />}>
          <Route
            path="/"
            element={androidClient ? <Navigate to="/login" replace /> : <LandingPage />}
          />
          <Route path="/login" element={<AuthPage mode="login" compact={androidClient} />} />
          <Route path="/register" element={<AuthPage mode="register" compact={androidClient} />} />
          <Route path="/sponsors" element={<SponsorsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/imprint" element={<ImprintPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/status/:id/:slug" element={<PublicStatusPageView />} />
          <Route path="/dashboard/:id/:slug" element={<DashboardViewPage />} />
        </Route>
        <Route path="/app" element={<ProtectedLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path={appPaths.resources} element={<ResourcesPage />} />
          <Route path={appPaths.resource} element={<ResourceDetailPage />} />
          <Route path={appPaths.checks} element={<ChecksPage />} />
          <Route path={appPaths.heartbeats} element={<HeartbeatsPage />} />
          <Route path={appPaths.agents} element={<AgentsPage />} />
          <Route path={appPaths.incidents} element={<OperationsPage view="incidents" />} />
          <Route path={appPaths.maintenance} element={<OperationsPage view="maintenance" />} />
          <Route path={appPaths.alertChannels} element={<NotificationsPage section="channels" />} />
          <Route path={appPaths.alertRules} element={<NotificationsPage section="rules" />} />
          <Route path={appPaths.alertHistory} element={<NotificationsPage section="history" />} />
          <Route path={appPaths.reports} element={<AnalyticsPage />} />
          <Route path={appPaths.serviceGoals} element={<ObjectivesPage />} />
          <Route path={appPaths.dashboards} element={<DashboardsPage />} />
          <Route path={appPaths.dashboardNew} element={<DashboardEditorPage />} />
          <Route path={appPaths.dashboardEdit} element={<DashboardEditorPage />} />
          <Route path={appPaths.statusPages} element={<StatusPagesPage />} />
          <Route path={appPaths.auditLog} element={<AuditPage />} />
          <Route path={appPaths.team} element={<TeamPage />} />
          <Route path={appPaths.account} element={<SettingsPage />} />
          <Route element={<GlobalAdminRoute />}>
            <Route path={appPaths.platform} element={<GlobalAdminPage section="overview" />} />
            <Route path={appPaths.platformUsers} element={<GlobalAdminPage section="users" />} />
            <Route
              path={appPaths.platformSponsorships}
              element={<GlobalAdminPage section="sponsorships" />}
            />
            <Route
              path={appPaths.platformSettings}
              element={<GlobalAdminPage section="settings" />}
            />
            <Route path={appPaths.platformAudit} element={<GlobalAdminPage section="audit" />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to={startupPath(runtime)} replace />} />
      </Routes>
    </Suspense>
  );
}
