import {
  Activity,
  BarChart3,
  BellRing,
  Bot,
  CalendarClock,
  ClipboardList,
  Gauge,
  Globe2,
  History,
  LayoutDashboard,
  Network,
  RadioTower,
  Route,
  Server,
  Settings,
  ShieldCheck,
  Siren,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { GuideTopic } from "./guide-content";

const icons: Record<string, LucideIcon> = {
  overview: Gauge,
  resources: Network,
  "resource-details": Server,
  checks: Activity,
  heartbeats: RadioTower,
  collectors: Bot,
  incidents: Siren,
  maintenance: CalendarClock,
  "alert-channels": BellRing,
  "alert-rules": Route,
  "alert-history": History,
  reports: BarChart3,
  "service-goals": Target,
  dashboards: LayoutDashboard,
  "status-pages": Globe2,
  team: Users,
  "audit-log": ClipboardList,
  account: Settings,
  platform: ShieldCheck,
};

export function GuideTopicIcon({ topic, className }: { topic: GuideTopic; className?: string }) {
  const Icon = icons[topic.id] ?? Gauge;
  return <Icon className={className} />;
}
