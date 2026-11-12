import type { CheckType } from "@mimorii/contracts";
import {
  CalendarClock,
  Clock,
  Container,
  Database,
  EthernetPort,
  Globe,
  HardDrive,
  Mail,
  Network,
  Radar,
  Server,
  ShieldCheck,
  Signpost,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export const checkTypeLabels: Record<CheckType, string> = {
  http: "HTTP",
  tcp: "TCP port",
  dns: "DNS record",
  icmp: "ICMP ping",
  wan: "WAN reachability",
  tls: "TLS certificate",
  smtp: "SMTP",
  grpc: "gRPC health",
  ntp: "NTP time",
  domain: "Domain expiry",
  database: "Database",
  host: "Host health",
  disk: "Disk usage",
  docker: "Docker",
};

export const checkTypeIcons: Record<CheckType, LucideIcon> = {
  http: Globe,
  tcp: EthernetPort,
  dns: Signpost,
  icmp: Radar,
  wan: Network,
  tls: ShieldCheck,
  smtp: Mail,
  grpc: Workflow,
  ntp: Clock,
  domain: CalendarClock,
  database: Database,
  host: Server,
  disk: HardDrive,
  docker: Container,
};

export const agentOnlyCheckTypes = new Set<CheckType>(["host", "disk", "docker"]);
