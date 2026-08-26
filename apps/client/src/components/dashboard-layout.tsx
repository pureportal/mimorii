import type { TeamSummary } from "@mimorii/contracts";
import {
  Activity,
  BarChart3,
  BellRing,
  Bot,
  CalendarClock,
  CircleHelp,
  CircleUserRound,
  ClipboardList,
  Gauge,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  RadioTower,
  Settings,
  ShieldCheck,
  Siren,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  appRoutes,
  isNavigationItemActive,
  isNavigationSubitemActive,
  mobilePrimaryItemIds,
  navigationContext,
  visibleNavigationGroups,
  type NavigationGroup,
  type NavigationItem,
  type NavigationItemId,
} from "../lib/app-navigation";
import { cn } from "../lib/cn";
import { Brand } from "./brand";
import { BrowserNotificationPrompt } from "./browser-notification-prompt";
import { ProductGuide } from "./guide/product-guide";
import { SponsorFavicon } from "./sponsor-favicon";
import { TeamPicker } from "./team-picker";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";

const navigationIcons: Record<NavigationItemId, LucideIcon> = {
  overview: Gauge,
  resources: Network,
  checks: Activity,
  heartbeats: RadioTower,
  agents: Bot,
  incidents: Siren,
  maintenance: CalendarClock,
  alerting: BellRing,
  reports: BarChart3,
  "service-goals": Target,
  dashboards: LayoutDashboard,
  "status-pages": Globe2,
  team: Users,
  "audit-log": ClipboardList,
  platform: ShieldCheck,
};

export function ProtectedLayout() {
  const { session, profileReady, activeTeam, setActiveTeamId, acknowledgeTour, logout } = useAuth();
  const location = useLocation();
  const [guideOpen, setGuideOpen] = useState(false);
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!activeTeam) {
    const platformAdministration =
      location.pathname.startsWith(appRoutes.platform) && session.user.isGlobalAdmin;
    if (location.pathname !== appRoutes.team && !platformAdministration) {
      return <Navigate to={appRoutes.team} replace />;
    }
    return (
      <div className="safe-page-footer min-h-dvh bg-canvas">
        <header className="flex h-[calc(4rem+var(--safe-area-top))] items-center justify-between border-b border-line bg-surface px-4 pt-[var(--safe-area-top)] sm:px-6">
          <Brand />
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-guide="guide-trigger"
              onClick={() => setGuideOpen(true)}
            >
              <CircleHelp /> Guide
            </Button>
            <SponsorFavicon placement="inline" />
          </div>
        </header>
        <main
          data-guide="page-content"
          className={cn(
            "mx-auto w-full px-4 py-12 sm:px-6",
            platformAdministration ? "max-w-[1500px]" : "max-w-2xl"
          )}
        >
          <BrowserNotificationPrompt />
          <Outlet />
        </main>
        <ProductGuide
          open={guideOpen}
          onOpenChange={setGuideOpen}
          teamRole="viewer"
          isGlobalAdmin={session.user.isGlobalAdmin}
          userId={session.user.id}
          profileReady={profileReady}
          acknowledgedTourIds={session.user.acknowledgedTourIds}
          onAcknowledgeTour={acknowledgeTour}
        />
      </div>
    );
  }

  const groups = visibleNavigationGroups(activeTeam.role, session.user.isGlobalAdmin);
  const context = navigationContext(location.pathname);

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="safe-fixed-side fixed z-40 hidden w-[272px] border-r border-line bg-surface/94 px-3 py-4 backdrop-blur-xl lg:flex lg:flex-col">
        <Brand className="px-3" />
        <div data-guide="workspace-switcher" className="relative mt-5 px-1">
          <TeamPicker
            activeTeamId={activeTeam.id}
            teams={session.teams}
            onTeamChange={setActiveTeamId}
            className="h-10 bg-canvas/65 text-xs"
          />
        </div>

        <nav
          aria-label="Primary navigation"
          data-guide="primary-navigation"
          className="mt-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-4"
        >
          {groups.map((group) => (
            <DesktopNavigationGroup
              key={group.label}
              group={group}
              pathname={location.pathname}
              nestedLabel={context.nestedLabel}
            />
          ))}
        </nav>

        <div className="border-t border-line px-1 pt-3">
          <button
            type="button"
            data-guide="guide-trigger"
            onClick={() => setGuideOpen(true)}
            className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-ink/5 hover:text-ink"
          >
            <CircleHelp className="size-[18px]" /> Guide
          </button>
          <Link
            to={appRoutes.account}
            aria-current={location.pathname === appRoutes.account ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-ink/5 hover:text-ink",
              location.pathname === appRoutes.account &&
                "bg-lavender-soft font-semibold text-violet-strong"
            )}
          >
            <Settings className="size-[18px]" /> Account
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-ink/5 hover:text-ink"
          >
            <LogOut className="size-[18px]" /> Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-[calc(4.25rem+var(--safe-area-top))] items-center justify-between border-b border-line bg-surface px-4 pt-[var(--safe-area-top)] sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Brand compact className="shrink-0 lg:hidden" />
            <div data-guide="page-heading" className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                {context.groupLabel}
              </p>
              <h1 className="truncate font-display text-base font-bold sm:text-lg">
                {context.title}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="lg:hidden">
              <Link to={appRoutes.account} aria-label="Account">
                <CircleUserRound />
              </Link>
            </Button>
            <SponsorFavicon placement="inline" />
          </div>
        </header>
        <main
          data-guide="page-content"
          className="safe-app-content mx-auto w-full max-w-[1500px] px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8"
        >
          <BrowserNotificationPrompt />
          <Outlet />
        </main>
      </div>

      <MobileNavigation
        groups={groups}
        activeTeamId={activeTeam.id}
        teams={session.teams}
        onTeamChange={setActiveTeamId}
        onSignOut={logout}
        onGuideOpen={() => setGuideOpen(true)}
      />
      <ProductGuide
        open={guideOpen}
        onOpenChange={setGuideOpen}
        teamRole={activeTeam.role}
        isGlobalAdmin={session.user.isGlobalAdmin}
        userId={session.user.id}
        profileReady={profileReady}
        acknowledgedTourIds={session.user.acknowledgedTourIds}
        onAcknowledgeTour={acknowledgeTour}
      />
    </div>
  );
}

function DesktopNavigationGroup({
  group,
  pathname,
  nestedLabel,
}: {
  group: NavigationGroup;
  pathname: string;
  nestedLabel?: string;
}) {
  const active = group.items.some((item) => isNavigationItemActive(pathname, item));
  return (
    <section>
      <h2
        className={cn(
          "mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted/70",
          active && "text-violet-strong"
        )}
      >
        {group.label}
      </h2>
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <DesktopNavigationItem
            key={item.id}
            item={item}
            pathname={pathname}
            nestedLabel={nestedLabel}
          />
        ))}
      </div>
    </section>
  );
}

function DesktopNavigationItem({
  item,
  pathname,
  nestedLabel,
}: {
  item: NavigationItem;
  pathname: string;
  nestedLabel?: string;
}) {
  const Icon = navigationIcons[item.id];
  const active = isNavigationItemActive(pathname, item);
  return (
    <div>
      <Link
        to={item.to}
        data-guide-nav={item.id}
        aria-current={active && !item.children ? "page" : undefined}
        className={cn(
          "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-ink/5 hover:text-ink",
          active && "bg-lavender-soft font-semibold text-violet-strong"
        )}
      >
        {active ? (
          <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-violet-strong" />
        ) : null}
        <Icon className="size-[18px] shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
      {active && item.children ? (
        <div className="ml-[21px] mt-1 space-y-0.5 border-l border-lavender/45 pl-4">
          {item.children.map((child) => {
            const childActive = isNavigationSubitemActive(pathname, child);
            return (
              <Link
                key={child.to}
                to={child.to}
                aria-current={childActive ? "page" : undefined}
                className={cn(
                  "flex min-h-8 items-center rounded-lg px-2 text-xs font-medium text-muted transition hover:bg-ink/5 hover:text-ink",
                  childActive && "bg-lavender-soft/70 font-semibold text-violet-strong"
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : active && nestedLabel ? (
        <div className="ml-[21px] mt-1 border-l border-lavender/45 py-1 pl-6 text-xs font-semibold text-violet-strong">
          {nestedLabel}
        </div>
      ) : null}
    </div>
  );
}

function MobileNavigation({
  groups,
  activeTeamId,
  teams,
  onTeamChange,
  onSignOut,
  onGuideOpen,
}: {
  groups: NavigationGroup[];
  activeTeamId: string;
  teams: TeamSummary[];
  onTeamChange: (id: string) => void;
  onSignOut: () => void;
  onGuideOpen: () => void;
}) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const items = groups.flatMap((group) => group.items);
  const primary = items.filter((item) => mobilePrimaryItemIds.has(item.id));
  const secondaryGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !mobilePrimaryItemIds.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);
  const moreActive =
    location.pathname === appRoutes.account ||
    secondaryGroups.some((group) =>
      group.items.some((item) => isNavigationItemActive(location.pathname, item))
    );

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        data-guide="mobile-navigation"
        className="safe-mobile-nav fixed bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/96 pt-1 backdrop-blur-xl lg:hidden"
      >
        {primary.map((item) => {
          const Icon = navigationIcons[item.id];
          const active = isNavigationItemActive(location.pathname, item);
          return (
            <Link
              key={item.id}
              to={item.to}
              data-guide-nav={item.id}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-muted",
                active && "text-violet-strong"
              )}
            >
              {active ? (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-violet-strong" />
              ) : null}
              <Icon className="size-5" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={cn(
            "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-muted",
            moreActive && "text-violet-strong"
          )}
        >
          {moreActive ? (
            <span className="absolute top-0 h-0.5 w-8 rounded-full bg-violet-strong" />
          ) : null}
          <Menu className="size-5" />
          More
        </button>
      </nav>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent presentation="drawer" className="lg:hidden">
          <DialogHeader
            title="Navigation"
            className="mb-0 flex h-14 items-center border-b border-line px-5 pr-12"
          />
          <div className="border-b border-line px-5 py-4">
            <TeamPicker
              activeTeamId={activeTeamId}
              teams={teams}
              onTeamChange={(id) => {
                onTeamChange(id);
                setOpen(false);
              }}
            />
          </div>
          <nav
            aria-label="All destinations"
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4"
          >
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted/70">
                  {group.label}
                </h2>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = navigationIcons[item.id];
                    const active = isNavigationItemActive(location.pathname, item);
                    return (
                      <Link
                        key={item.id}
                        to={item.to}
                        data-guide-nav={item.id}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-ink/5 hover:text-ink",
                          active && "bg-lavender-soft font-semibold text-violet-strong"
                        )}
                      >
                        {active ? (
                          <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-violet-strong" />
                        ) : null}
                        <Icon className="size-[18px] shrink-0" />
                        <span className="min-w-0 truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
          <div className="space-y-0.5 border-t border-line p-3">
            <button
              type="button"
              data-guide="guide-trigger"
              onClick={() => {
                setOpen(false);
                onGuideOpen();
              }}
              className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-ink/5 hover:text-ink"
            >
              <CircleHelp className="size-[18px]" /> Guide
            </button>
            <Link
              to={appRoutes.account}
              aria-current={location.pathname === appRoutes.account ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-ink/5 hover:text-ink",
                location.pathname === appRoutes.account &&
                  "bg-lavender-soft font-semibold text-violet-strong"
              )}
            >
              <Settings className="size-[18px]" /> Account
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-ink/5 hover:text-ink"
            >
              <LogOut className="size-[18px]" /> Sign out
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
