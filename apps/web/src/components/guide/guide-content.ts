import { appRoutes, type NavigationItemId } from "../../lib/app-navigation";

export type GuideGroupId =
  | "monitoring"
  | "operations"
  | "insights"
  | "publishing"
  | "workspace"
  | "account"
  | "administration";

export type GuideAccess = "everyone" | "team-admin" | "global-admin";

export interface GuideSection {
  title: string;
  items: readonly string[];
}

export interface GuideDistinction {
  title: string;
  text: string;
}

export interface GuideTourStop {
  target: string;
  title: string;
  content: string;
  placement?: "top" | "right" | "bottom" | "left" | "center";
}

export interface GuideTopic {
  id: string;
  title: string;
  group: GuideGroupId;
  summary: string;
  to: string;
  exactPaths: readonly string[];
  pathPrefix?: string;
  keywords: readonly string[];
  sections: readonly GuideSection[];
  distinctions?: readonly GuideDistinction[];
  tour: readonly GuideTourStop[];
  access?: GuideAccess;
  navigationId?: NavigationItemId;
  menu?: boolean;
}

export interface GuideWorkflowStep {
  title: string;
  text: string;
  to?: string;
  action?: string;
}

export interface GuideWorkflow {
  id: string;
  title: string;
  summary: string;
  keywords: readonly string[];
  steps: readonly GuideWorkflowStep[];
  access?: GuideAccess;
}

export const guideGroupOrder: readonly GuideGroupId[] = [
  "monitoring",
  "operations",
  "insights",
  "publishing",
  "workspace",
  "account",
  "administration",
];

export const guideGroupLabels: Record<GuideGroupId, string> = {
  monitoring: "Monitoring",
  operations: "Operations",
  insights: "Insights",
  publishing: "Publishing",
  workspace: "Workspace",
  account: "Account",
  administration: "Administration",
};

export const guideTopics: readonly GuideTopic[] = [
  {
    id: "overview",
    title: "Overview",
    group: "monitoring",
    summary:
      "A live summary of your workspace health and the quickest route to anything that needs attention.",
    to: appRoutes.overview,
    exactPaths: [appRoutes.overview],
    keywords: ["home", "health", "uptime", "latency", "incidents", "summary"],
    navigationId: "overview",
    sections: [
      {
        title: "What you see",
        items: [
          "Current uptime, response time, monitor state, and open incidents.",
          "Active maintenance and breached goals when either needs attention.",
          "A response-time chart and the latest state of your resources.",
        ],
      },
      {
        title: "What to do here",
        items: [
          "Open a resource to investigate its checks, heartbeats, and history.",
          "Use Reports for a longer time range or add a resource to start monitoring something new.",
        ],
      },
    ],
    tour: [
      {
        target: '[data-guide-page="overview-status"]',
        title: "Workspace health",
        content: "This headline tells you whether everything is healthy or an incident is active.",
        placement: "bottom",
      },
      {
        target: '[data-guide-page="overview-metrics"]',
        title: "Health at a glance",
        content: "These cards combine checks and heartbeats into a quick operational summary.",
      },
      {
        target: '[data-guide-page="overview-details"]',
        title: "Recent behavior",
        content:
          "Use the chart for the last day and open a resource when you need its full history.",
      },
    ],
  },
  {
    id: "resources",
    title: "Resources",
    group: "monitoring",
    summary: "The websites, services, ports, and servers whose health you want Mimorii to follow.",
    to: appRoutes.resources,
    exactPaths: [appRoutes.resources],
    keywords: ["website", "service", "server", "endpoint", "host", "target", "tags"],
    navigationId: "resources",
    sections: [
      {
        title: "What you find here",
        items: [
          "Every resource, its current state, check count, last result, and tags.",
          "Search across names, addresses, and tags.",
          "Quick setup for a website, a TCP port, or a server connected through a collector.",
        ],
      },
      {
        title: "When you add one",
        items: [
          "Mimorii creates the resource and its first suitable check together.",
          "Advanced options let you choose timing and basic response expectations before saving.",
        ],
      },
    ],
    distinctions: [
      {
        title: "Resource",
        text: "The thing you care about, such as your website or production server.",
      },
      {
        title: "Check",
        text: "A test Mimorii runs against that resource, such as loading a URL or checking disk use.",
      },
    ],
    tour: [
      {
        target: '[data-guide-page="resources-toolbar"]',
        title: "Find or add a resource",
        content: "Search the current workspace or add a website, port, or server from here.",
      },
      {
        target: '[data-guide-page="resources-list"]',
        title: "Resource cards",
        content: "Each card shows the current state and opens the resource's full monitoring view.",
      },
    ],
  },
  {
    id: "resource-details",
    title: "Resource details",
    group: "monitoring",
    summary:
      "One resource's current health, history, checks, heartbeats, server metrics, and detected technology.",
    to: appRoutes.resources,
    exactPaths: [],
    pathPrefix: `${appRoutes.resources}/`,
    keywords: ["resource", "history", "cpu", "memory", "disk", "technology", "edit"],
    navigationId: "resources",
    menu: false,
    sections: [
      {
        title: "What you see",
        items: [
          "The target, tags, status, and maintenance state at the top.",
          "Latency history for any attached check, plus compact check and heartbeat lists.",
          "CPU, memory, load, volumes, network, and technology details when a collector supplies them.",
        ],
      },
      {
        title: "What you can change",
        items: [
          "Edit the name, target, description, tags, or collector connection.",
          "Open Manage checks or Manage heartbeats with this resource already selected.",
        ],
      },
    ],
    tour: [
      {
        target: '[data-guide-page="resource-heading"]',
        title: "Resource identity",
        content: "The status, target, description, and tags describe the resource you are viewing.",
      },
      {
        target: '[data-guide-page="resource-history"]',
        title: "Check history",
        content: "Choose a check to see how its response time has changed.",
      },
      {
        target: '[data-guide-page="resource-monitors"]',
        title: "Attached monitors",
        content:
          "Checks test the resource; heartbeats confirm that scheduled work has reported back.",
      },
    ],
  },
  {
    id: "checks",
    title: "Checks",
    group: "monitoring",
    summary: "Tests that Mimorii runs on a schedule to decide whether a resource is healthy.",
    to: appRoutes.checks,
    exactPaths: [appRoutes.checks],
    keywords: ["http", "tcp", "dns", "host", "disk", "run", "pause", "threshold"],
    navigationId: "checks",
    sections: [
      {
        title: "Available checks",
        items: [
          "HTTP for pages and APIs, TCP for open ports, and DNS for records.",
          "Server health and disk usage when a collector supplies machine data.",
          "Timing, timeout, failure, and recovery settings under Advanced.",
        ],
      },
      {
        title: "List actions",
        items: [
          "Filter by resource or state, run a check now, edit it, pause it, or delete it.",
          "The table shows one-day uptime, latest response time, and last run.",
        ],
      },
    ],
    distinctions: [
      {
        title: "Check",
        text: "Mimorii starts the test and waits for the target to answer.",
      },
      {
        title: "Heartbeat",
        text: "Your scheduled job contacts Mimorii to say it started, succeeded, or failed.",
      },
    ],
    tour: [
      {
        target: '[data-guide-page="checks-filters"]',
        title: "Find the right check",
        content: "Search by name or type, then narrow the list by resource and state.",
      },
      {
        target: '[data-guide-page="checks-list"]',
        title: "Results and controls",
        content:
          "Read uptime and response time here, or use the row controls to run, edit, pause, or delete a check.",
      },
    ],
  },
  {
    id: "heartbeats",
    title: "Heartbeats",
    group: "monitoring",
    summary:
      "Deadlines for scheduled jobs, backups, and other work that should report back regularly.",
    to: appRoutes.heartbeats,
    exactPaths: [appRoutes.heartbeats],
    keywords: ["cron", "job", "backup", "ping", "deadline", "token", "runtime"],
    navigationId: "heartbeats",
    sections: [
      {
        title: "How they work",
        items: [
          "Choose how often the job should report, how much grace time it gets, and its maximum runtime.",
          "After creation, copy the success, start, and failure addresses into the job.",
          "A missed deadline or explicit failure changes the monitor state.",
        ],
      },
      {
        title: "What you can review",
        items: [
          "Success rate, average duration, last signal, next deadline, and full event history.",
          "Rotating the token creates new addresses and stops the old ones from working.",
        ],
      },
    ],
    tour: [
      {
        target: '[data-guide-page="heartbeats-toolbar"]',
        title: "Choose a resource",
        content: "Filter the monitors or add a heartbeat for one of your resources.",
      },
      {
        target: '[data-guide-page="heartbeats-list"]',
        title: "Deadlines and history",
        content:
          "This table shows whether each job is reporting on time and gives access to its history and token controls.",
      },
    ],
  },
  {
    id: "collectors",
    title: "Collectors",
    group: "monitoring",
    summary: "Small Mimorii agents that send server health and run checks from another network.",
    to: appRoutes.collectors,
    exactPaths: [appRoutes.collectors],
    keywords: ["agent", "private network", "server metrics", "enroll", "key", "collection"],
    navigationId: "collectors",
    sections: [
      {
        title: "When to use one",
        items: [
          "Monitor a server's CPU, memory, disks, load, and network activity.",
          "Run website or port checks from a private office, home, or regional network.",
        ],
      },
      {
        title: "Collector controls",
        items: [
          "Add a collector, copy its one-time enrollment command, and run that command on the target machine.",
          "Change how often it reports, rotate its enrollment key, or revoke it.",
        ],
      },
    ],
    distinctions: [
      {
        title: "Direct",
        text: "The Mimorii server runs the check itself.",
      },
      {
        title: "Collector",
        text: "An installed agent runs or supplies monitoring from the machine and network where it lives.",
      },
    ],
    tour: [
      {
        target: '[data-guide-page="collectors-actions"]',
        title: "Add a collector",
        content: "Create the collector here, then copy the enrollment command shown once.",
      },
      {
        target: '[data-guide-page="collectors-list"]',
        title: "Connection state",
        content:
          "Each card shows where the collector runs, when it last reported, and its collection interval.",
      },
    ],
  },
  {
    id: "incidents",
    title: "Incidents",
    group: "operations",
    summary:
      "A shared timeline for unexpected service problems and the updates made while resolving them.",
    to: appRoutes.incidents,
    exactPaths: [appRoutes.incidents],
    keywords: ["outage", "problem", "impact", "investigating", "resolved", "update"],
    navigationId: "incidents",
    sections: [
      {
        title: "Incident record",
        items: [
          "Give the problem a title and impact, then select every affected resource.",
          "Publish updates as you investigate, identify the cause, monitor recovery, and resolve it.",
          "The timeline keeps earlier updates and the total duration.",
        ],
      },
      {
        title: "Who can change it",
        items: [
          "Owners, admins, and members can declare and update incidents; viewers can read them.",
        ],
      },
    ],
    distinctions: [
      {
        title: "Incident",
        text: "Unexpected impact that needs investigation and status updates.",
      },
      {
        title: "Maintenance",
        text: "Planned work with a known start and end time.",
      },
    ],
    tour: [
      {
        target: '[data-guide-page="operations-summary"]',
        title: "Current operations",
        content: "See active problems and declare a new incident from this row.",
      },
      {
        target: '[data-guide-page="operations-content"]',
        title: "Incident timeline",
        content:
          "Open updates show the latest message first, with earlier updates kept underneath.",
      },
    ],
  },
  {
    id: "maintenance",
    title: "Maintenance",
    group: "operations",
    summary:
      "Planned work that marks selected resources as under maintenance for a defined period.",
    to: appRoutes.maintenance,
    exactPaths: [appRoutes.maintenance],
    keywords: ["planned", "window", "schedule", "recurring", "notifications", "suppress"],
    navigationId: "maintenance",
    sections: [
      {
        title: "Schedule",
        items: [
          "Set the start and end time, choose affected resources, and optionally repeat daily, weekly, or monthly.",
          "Notification suppression is selected by default and can be changed before saving.",
        ],
      },
      {
        title: "After scheduling",
        items: [
          "Edit future details or cancel a scheduled or active window.",
          "Owners and admins can delete maintenance records.",
        ],
      },
    ],
    distinctions: [
      {
        title: "Maintenance state",
        text: "Shows planned impact without treating it as an unexpected outage.",
      },
      {
        title: "Notification suppression",
        text: "Prevents routine monitoring alerts for the selected resources during the window.",
      },
    ],
    tour: [
      {
        target: '[data-guide-page="operations-summary"]',
        title: "Maintenance status",
        content: "See active windows and schedule planned work from here.",
      },
      {
        target: '[data-guide-page="operations-content"]',
        title: "Scheduled windows",
        content:
          "Each card shows timing, recurrence, affected resources, and the available edit or cancel actions.",
      },
    ],
  },
  {
    id: "alert-channels",
    title: "Alerting: Channels",
    group: "operations",
    summary: "The destinations Mimorii can contact when a routing rule matches an event.",
    to: appRoutes.alertChannels,
    exactPaths: [appRoutes.alertChannels],
    keywords: ["alert", "email", "webhook", "push", "recipient", "test"],
    navigationId: "alerting",
    access: "team-admin",
    sections: [
      {
        title: "Channel types",
        items: [
          "Email to one or more addresses.",
          "Webhook to another service, with an optional signing secret.",
          "Browser and Android push to selected team members and registered devices.",
        ],
      },
      {
        title: "Before routing alerts",
        items: ["Add the destination and use Test to confirm that it can receive a message."],
      },
    ],
    distinctions: [
      { title: "Channel", text: "Where a notification is sent." },
      { title: "Routing rule", text: "Which events use which channels." },
      { title: "Delivery history", text: "What Mimorii tried to send and whether it arrived." },
    ],
    tour: [
      {
        target: '[data-guide-page="alerting-summary"]',
        title: "Add a destination",
        content: "Create an email, webhook, or push channel here.",
      },
      {
        target: '[data-guide-page="alerting-content"]',
        title: "Test before routing",
        content: "Use Test on a channel, then connect it to events under Routing rules.",
      },
    ],
  },
  {
    id: "alert-rules",
    title: "Alerting: Routing rules",
    group: "operations",
    summary:
      "Rules that connect selected monitoring events and optional conditions to one or more channels.",
    to: appRoutes.alertRules,
    exactPaths: [appRoutes.alertRules],
    keywords: ["policy", "events", "conditions", "and", "or", "channel", "route"],
    navigationId: "alerting",
    access: "team-admin",
    sections: [
      {
        title: "Build a rule",
        items: [
          "Select events such as incidents, check changes, maintenance, or breached goals.",
          "Choose the channels that should receive matching events.",
          "Use Advanced conditions only when the selected events need narrower filtering.",
        ],
      },
      {
        title: "Condition groups",
        items: [
          "AND requires every condition in the group to match; OR requires any one of them.",
          "Rules can be disabled without deleting their setup.",
        ],
      },
    ],
    tour: [
      {
        target: '[data-guide-page="alerting-summary"]',
        title: "Create a rule",
        content: "A channel must exist before you can add a routing rule.",
      },
      {
        target: '[data-guide-page="alerting-content"]',
        title: "Event routes",
        content:
          "Each card summarizes its destination channels, selected events, and optional conditions.",
      },
    ],
  },
  {
    id: "alert-history",
    title: "Alerting: Delivery history",
    group: "operations",
    summary: "A record of recent notification attempts, including retries and delivery errors.",
    to: appRoutes.alertHistory,
    exactPaths: [appRoutes.alertHistory],
    keywords: ["delivery", "sent", "failed", "retry", "attempt", "error"],
    navigationId: "alerting",
    access: "team-admin",
    sections: [
      {
        title: "What the table shows",
        items: [
          "The channel, event, time, attempt count, latest error, and final state.",
          "Failed deliveries can be retried from their row.",
          "The most recent 100 deliveries are loaded.",
        ],
      },
    ],
    tour: [
      {
        target: '[data-guide-page="alerting-content"]',
        title: "Delivery results",
        content:
          "Use the error and attempt columns to diagnose failures, then retry when the destination is ready.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    group: "insights",
    summary:
      "Historical availability, response time, incidents, and recovery measures for a chosen period.",
    to: appRoutes.reports,
    exactPaths: [appRoutes.reports],
    keywords: ["analytics", "availability", "p95", "latency", "recovery", "mttr", "mtbf"],
    navigationId: "reports",
    sections: [
      {
        title: "Choose the data",
        items: [
          "Set a date range, then optionally narrow it to one resource or one check.",
          "Changing the resource also narrows the list of available checks.",
        ],
      },
      {
        title: "Measures",
        items: [
          "Availability and degraded time, P50, P95, and P99 response time.",
          "Incident count, average recovery time, and average time between failures.",
        ],
      },
    ],
    distinctions: [
      { title: "Reports", text: "Explore what happened over a selected historical period." },
      {
        title: "Service goals",
        text: "Compare ongoing reliability with a target and error budget.",
      },
    ],
    tour: [
      {
        target: '[data-guide-page="reports-filters"]',
        title: "Choose a period",
        content: "Set dates and narrow the report to a resource or check when needed.",
      },
      {
        target: '[data-guide-page="reports-summary"]',
        title: "Reliability summary",
        content: "These measures cover availability, response time, incidents, and recovery.",
      },
      {
        target: '[data-guide-page="reports-chart"]',
        title: "Daily availability",
        content: "The chart shows how availability changed across the selected period.",
      },
    ],
  },
  {
    id: "service-goals",
    title: "Service goals",
    group: "insights",
    summary: "Reliability targets for a resource or check, measured over a rolling time window.",
    to: appRoutes.serviceGoals,
    exactPaths: [appRoutes.serviceGoals],
    keywords: ["slo", "target", "budget", "burn", "availability", "latency"],
    navigationId: "service-goals",
    sections: [
      {
        title: "Create a goal",
        items: [
          "Choose a resource, optionally one check, an availability target, and a 7, 30, or 90 day window.",
          "Add a P95 response-time target when speed matters as well as availability.",
        ],
      },
      {
        title: "Read a goal",
        items: [
          "The state shows whether the goal is healthy, at risk, or breached.",
          "Budget is the remaining allowed downtime; burn shows how quickly that allowance is being used.",
        ],
      },
    ],
    tour: [
      {
        target: '[data-guide-page="goals-summary"]',
        title: "Add a reliability target",
        content: "Owners and admins can create a goal for a resource or one of its checks.",
      },
      {
        target: '[data-guide-page="goals-list"]',
        title: "Goal health",
        content:
          "Each card combines actual availability, the target, response time, and remaining downtime budget.",
      },
    ],
  },
  {
    id: "dashboards",
    title: "Shared dashboards",
    group: "publishing",
    summary:
      "Custom read-only views of selected metrics, uptime, current state, and recent incidents.",
    to: appRoutes.dashboards,
    exactPaths: [appRoutes.dashboards, appRoutes.dashboardNew],
    pathPrefix: `${appRoutes.dashboards}/`,
    keywords: ["share", "panel", "metric", "public", "private", "protected", "link"],
    navigationId: "dashboards",
    sections: [
      {
        title: "Dashboard panels",
        items: [
          "Single metrics, uptime history, current resource state, and recent incidents.",
          "Panels can cover all resources or a selected resource, use one to three columns, and be reordered.",
        ],
      },
      {
        title: "Access choices",
        items: [
          "Public dashboards open for anyone with the address.",
          "Private dashboards require a Mimorii sign-in.",
          "Protected links contain a secret key that can be regenerated or revoked.",
        ],
      },
    ],
    distinctions: [
      {
        title: "Shared dashboard",
        text: "A flexible collection of monitoring panels for readers.",
      },
      {
        title: "Status page",
        text: "A customer-facing service page focused on component state, incidents, maintenance, uptime, and subscriptions.",
      },
    ],
    tour: [
      {
        target: '[data-guide-page="dashboards-summary"]',
        title: "Create a dashboard",
        content: "Owners and admins choose the panels and access mode.",
      },
      {
        target: '[data-guide-page="dashboards-content"]',
        title: "Open or edit",
        content:
          "Cards show the address, access mode, and panel count, with open and management actions underneath.",
      },
    ],
  },
  {
    id: "status-pages",
    title: "Status pages",
    group: "publishing",
    summary:
      "Public service-health pages for selected resources, incidents, maintenance, uptime, and email updates.",
    to: appRoutes.statusPages,
    exactPaths: [appRoutes.statusPages],
    keywords: ["public", "customer", "component", "subscriber", "publish", "uptime"],
    navigationId: "status-pages",
    sections: [
      {
        title: "Page content",
        items: [
          "Current state for the selected resources, with optional 30-day uptime.",
          "Related active and historical incidents plus maintenance windows.",
          "Email subscriptions that visitors confirm from their inbox.",
        ],
      },
      {
        title: "Page controls",
        items: [
          "Keep a page as a draft or publish it at its chosen address.",
          "Open it, manage subscribers, edit its components, unpublish it, or delete it.",
        ],
      },
    ],
    tour: [
      {
        target: '[data-guide-page="status-pages-summary"]',
        title: "Create a public page",
        content: "Choose the resources your audience should see and publish when it is ready.",
      },
      {
        target: '[data-guide-page="status-pages-content"]',
        title: "Publishing controls",
        content: "Each card shows its address, publishing state, component count, and subscribers.",
      },
    ],
  },
  {
    id: "team",
    title: "Team",
    group: "workspace",
    summary: "Workspace membership, invitations, roles, and the place to create or switch teams.",
    to: appRoutes.team,
    exactPaths: [appRoutes.team],
    keywords: ["member", "invite", "role", "owner", "admin", "viewer", "workspace"],
    navigationId: "team",
    sections: [
      {
        title: "Roles",
        items: [
          "Owners control the team and can delete it.",
          "Admins manage members, alerting, goals, publishing, and the audit log.",
          "Members can operate monitoring and incidents; viewers have read-only access.",
        ],
      },
      {
        title: "Membership",
        items: [
          "Owners and admins create invitation links, choose a role, change member roles, and revoke pending invitations.",
          "Anyone can create another team; use the workspace selector to move between teams.",
        ],
      },
    ],
    tour: [
      {
        target: '[data-guide-page="team-summary"]',
        title: "Team controls",
        content:
          "Manage this team, create another one, or invite a person when your role allows it.",
      },
      {
        target: '[data-guide-page="team-members"]',
        title: "Members and roles",
        content: "Roles decide which management actions each person can use.",
      },
    ],
  },
  {
    id: "audit-log",
    title: "Audit log",
    group: "workspace",
    summary: "A chronological record of important workspace changes and who made them.",
    to: appRoutes.auditLog,
    exactPaths: [appRoutes.auditLog],
    keywords: ["event", "change", "actor", "history", "security", "load more"],
    navigationId: "audit-log",
    access: "team-admin",
    sections: [
      {
        title: "What is recorded",
        items: [
          "The action, person or system, affected object, and time.",
          "Events load 100 at a time; use Load more to continue into older history.",
        ],
      },
    ],
    tour: [
      {
        target: '[data-guide-page="audit-events"]',
        title: "Workspace history",
        content:
          "Read who or what made each change, which object it affected, and when it happened.",
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    group: "account",
    summary:
      "Your profile, API tokens, notification device, password, server connection, privacy, and legal links.",
    to: appRoutes.account,
    exactPaths: [appRoutes.account],
    keywords: ["profile", "token", "push", "password", "server", "privacy", "api"],
    sections: [
      {
        title: "Personal settings",
        items: [
          "Change your display name or password and manage this device's push notifications.",
          "Create API tokens, copy each new token once, and revoke tokens you no longer need.",
        ],
      },
      {
        title: "Application settings",
        items: [
          "Change the Mimorii server address; saving it signs you out so you can reconnect.",
          "Open API documentation, privacy choices, legal pages, and the installed version.",
        ],
      },
    ],
    tour: [
      {
        target: '[data-guide-page="account-settings"]',
        title: "Account settings",
        content:
          "These cards separate your identity, access tokens, notifications, security, server connection, and app information.",
      },
    ],
  },
  {
    id: "platform",
    title: "Platform",
    group: "administration",
    summary:
      "Global administration for the whole Mimorii installation, available only to global administrators.",
    to: appRoutes.platform,
    exactPaths: [
      appRoutes.platform,
      appRoutes.platformUsers,
      appRoutes.platformSponsorships,
      appRoutes.platformSettings,
      appRoutes.platformAudit,
    ],
    pathPrefix: `${appRoutes.platform}/`,
    keywords: ["global", "users", "accounts", "sponsors", "retention", "platform audit"],
    navigationId: "platform",
    access: "global-admin",
    sections: [
      {
        title: "Overview and users",
        items: [
          "Installation-wide counts for accounts, teams, resources, checks, incidents, and sponsorships.",
          "Search accounts, enable or disable access, grant global administration, and revoke sessions and API tokens.",
        ],
      },
      {
        title: "Sponsorships, settings, and audit",
        items: [
          "Review sponsorship applications and manage published sponsors, tiers, ordering, and artwork sources.",
          "Set sponsorship-application retention and review installation-wide audit events.",
        ],
      },
    ],
    distinctions: [
      { title: "Team audit log", text: "Changes inside the active workspace." },
      {
        title: "Platform audit log",
        text: "Administrative changes across the entire installation.",
      },
    ],
    tour: [
      {
        target: '[data-guide-page="platform-tabs"]',
        title: "Administration sections",
        content:
          "Move between installation statistics, users, sponsorships, settings, and the platform audit log.",
      },
      {
        target: '[data-guide-page="platform-content"]',
        title: "Platform controls",
        content:
          "This area applies to the whole Mimorii installation rather than only the active team.",
      },
    ],
  },
];

export const guideWorkflows: readonly GuideWorkflow[] = [
  {
    id: "monitor-website",
    title: "Monitor a website",
    summary: "Add a website, confirm its first HTTP check, and review results.",
    keywords: ["website", "url", "http", "uptime"],
    steps: [
      {
        title: "Add the website",
        text: "Open Resources, choose Add resource, keep Website selected, and enter a clear name and URL.",
        to: appRoutes.newResource,
        action: "Add website",
      },
      {
        title: "Choose where it runs",
        text: "Keep Agent set to Direct for a check from the Mimorii server, or choose a collector for another location.",
        to: appRoutes.collectors,
        action: "View collectors",
      },
      {
        title: "Set expectations",
        text: "Under Advanced, adjust the expected status, response text, interval, or timeout only when the defaults do not fit.",
        to: appRoutes.newResource,
        action: "Open setup",
      },
      {
        title: "Review the result",
        text: "Open the new resource for its history, or use Checks to run, edit, or pause the HTTP check.",
        to: appRoutes.checks,
        action: "Open checks",
      },
    ],
  },
  {
    id: "monitor-server",
    title: "Monitor a server",
    summary: "Connect a collector, add the server, and inspect its machine health.",
    keywords: ["server", "collector", "cpu", "memory", "disk", "agent"],
    steps: [
      {
        title: "Create a collector",
        text: "Open Collectors, choose Add collector, give it a recognizable name, and create it.",
        to: appRoutes.collectors,
        action: "Add collector",
      },
      {
        title: "Enroll the machine",
        text: "Copy the command shown once and run it on the server you want to monitor.",
        to: appRoutes.collectors,
        action: "Open collectors",
      },
      {
        title: "Add the server resource",
        text: "In Resources, choose Server, select the connected collector, and save the resource.",
        to: appRoutes.newResource,
        action: "Add server",
      },
      {
        title: "Review machine health",
        text: "Open the resource to see CPU, memory, load, disk, swap, network, volumes, and detected technology as data arrives.",
        to: appRoutes.resources,
        action: "Open resources",
      },
    ],
  },
  {
    id: "monitor-job",
    title: "Monitor a scheduled job",
    summary: "Create a heartbeat and connect its addresses to a job or backup.",
    keywords: ["heartbeat", "cron", "backup", "scheduled job", "ping"],
    steps: [
      {
        title: "Choose its resource",
        text: "Create or select the resource that the job belongs to.",
        to: appRoutes.resources,
        action: "Open resources",
      },
      {
        title: "Add a heartbeat",
        text: "Set how often the job should report, its grace period, and an optional maximum runtime.",
        to: appRoutes.heartbeats,
        action: "Add heartbeat",
      },
      {
        title: "Connect the job",
        text: "Copy the success address for normal completion. Use the start and failure addresses when the job can report those states too.",
        to: appRoutes.heartbeats,
        action: "Open heartbeats",
      },
      {
        title: "Check the history",
        text: "Use the history button to review starts, successes, failures, missed deadlines, messages, and durations.",
        to: appRoutes.heartbeats,
        action: "View history",
      },
    ],
  },
  {
    id: "set-up-alerts",
    title: "Set up alerts",
    summary: "Create a destination, test it, route events, and check deliveries.",
    keywords: ["alert", "notification", "email", "webhook", "push", "routing"],
    access: "team-admin",
    steps: [
      {
        title: "Add a channel",
        text: "Choose email, webhook, or browser and Android push, then enter its recipients or destination.",
        to: appRoutes.alertChannels,
        action: "Add channel",
      },
      {
        title: "Send a test",
        text: "Use Test on the channel and fix the destination before connecting real events.",
        to: appRoutes.alertChannels,
        action: "Test channel",
      },
      {
        title: "Add a routing rule",
        text: "Select the events and channels. Add conditions only when the rule should handle a narrower case.",
        to: appRoutes.alertRules,
        action: "Add rule",
      },
      {
        title: "Review delivery",
        text: "Open Delivery history to see attempts and errors. Retry a failed row after fixing its destination.",
        to: appRoutes.alertHistory,
        action: "Open history",
      },
    ],
  },
  {
    id: "handle-incident",
    title: "Handle an incident",
    summary: "Declare impact, keep readers updated, and close the timeline when service recovers.",
    keywords: ["incident", "outage", "update", "resolve", "status page"],
    steps: [
      {
        title: "Declare the incident",
        text: "Enter a clear title, choose the impact and affected resources, and publish the first update.",
        to: appRoutes.incidents,
        action: "Declare incident",
      },
      {
        title: "Publish progress",
        text: "Use Update to move through investigating, identified, and monitoring while adding a plain-language message.",
        to: appRoutes.incidents,
        action: "Open incidents",
      },
      {
        title: "Check public communication",
        text: "If an affected resource is on a published status page, open that page to confirm what visitors can see.",
        to: appRoutes.statusPages,
        action: "Open status pages",
      },
      {
        title: "Resolve it",
        text: "Publish a final update with Resolved selected. Mimorii keeps the timeline and duration for later review.",
        to: appRoutes.incidents,
        action: "Resolve incident",
      },
    ],
  },
  {
    id: "plan-maintenance",
    title: "Plan maintenance",
    summary: "Schedule planned work, choose its resources, and control notifications.",
    keywords: ["maintenance", "schedule", "planned", "suppress", "recurring"],
    steps: [
      {
        title: "Schedule the window",
        text: "Enter the name, start and end, then choose every affected resource.",
        to: appRoutes.maintenance,
        action: "Schedule maintenance",
      },
      {
        title: "Choose recurrence",
        text: "Keep None for one-time work, or repeat daily, weekly, or monthly with an optional end date.",
        to: appRoutes.maintenance,
        action: "Open maintenance",
      },
      {
        title: "Choose alert behavior",
        text: "Leave Suppress notifications selected when routine monitor alerts should stay quiet during the work.",
        to: appRoutes.maintenance,
        action: "Review window",
      },
      {
        title: "Edit or cancel",
        text: "Change the plan before or during the window, or cancel it when the work will not continue.",
        to: appRoutes.maintenance,
        action: "Manage maintenance",
      },
    ],
  },
  {
    id: "review-reliability",
    title: "Review reliability",
    summary: "Use reports for history and goals for ongoing targets.",
    keywords: ["report", "goal", "slo", "availability", "latency", "budget"],
    steps: [
      {
        title: "Choose a report period",
        text: "Set the dates and narrow the report to a resource or check when you need a focused view.",
        to: appRoutes.reports,
        action: "Open reports",
      },
      {
        title: "Read the measures",
        text: "Review availability, response-time percentiles, incidents, recovery, and time between failures.",
        to: appRoutes.reports,
        action: "View report",
      },
      {
        title: "Create a goal",
        text: "Choose a target and window for a resource or check, plus a P95 response-time target when needed.",
        to: appRoutes.serviceGoals,
        action: "Add goal",
      },
      {
        title: "Watch the budget",
        text: "Use the goal state, remaining downtime budget, and burn bar to see whether reliability is at risk.",
        to: appRoutes.serviceGoals,
        action: "Open goals",
      },
    ],
  },
  {
    id: "share-dashboard",
    title: "Share a dashboard",
    summary: "Choose panels and an access mode for a read-only monitoring view.",
    keywords: ["dashboard", "panel", "public", "private", "protected", "share"],
    access: "team-admin",
    steps: [
      {
        title: "Create the dashboard",
        text: "Give it a name and address, then choose public, private, or protected access.",
        to: appRoutes.dashboardNew,
        action: "Create dashboard",
      },
      {
        title: "Add panels",
        text: "Choose metrics, uptime history, current status, or recent incidents and select the relevant resources.",
        to: appRoutes.dashboardNew,
        action: "Add panels",
      },
      {
        title: "Arrange the view",
        text: "Set each panel to one, two, or three columns and move panels into the order readers need.",
        to: appRoutes.dashboardNew,
        action: "Edit dashboard",
      },
      {
        title: "Share safely",
        text: "For protected access, copy the generated link when it appears. Regenerating or revoking it stops the previous link.",
        to: appRoutes.dashboards,
        action: "Open dashboards",
      },
    ],
  },
  {
    id: "publish-status-page",
    title: "Publish a status page",
    summary: "Choose public components, publish the page, and manage subscribers.",
    keywords: ["status page", "customer", "public", "subscriber", "component"],
    access: "team-admin",
    steps: [
      {
        title: "Create the page",
        text: "Enter a name and address, then select the resources that should appear as components.",
        to: appRoutes.statusPages,
        action: "Create status page",
      },
      {
        title: "Choose uptime visibility",
        text: "Leave Show uptime selected when visitors should see the 30-day history for each component.",
        to: appRoutes.statusPages,
        action: "Edit page",
      },
      {
        title: "Publish and open",
        text: "Publish immediately or keep a draft. Use Open to check the exact public view.",
        to: appRoutes.statusPages,
        action: "Open status pages",
      },
      {
        title: "Manage subscribers",
        text: "Visitors can request email updates from the public page. Use Subscribers to review or remove them.",
        to: appRoutes.statusPages,
        action: "Manage subscribers",
      },
    ],
  },
  {
    id: "invite-team",
    title: "Invite a teammate",
    summary: "Create an invitation link, choose access, and manage the pending invite.",
    keywords: ["team", "invite", "member", "role", "access"],
    access: "team-admin",
    steps: [
      {
        title: "Create the invitation",
        text: "Open Team, choose Invite, enter the email address, and select admin, member, or viewer.",
        to: appRoutes.team,
        action: "Invite member",
      },
      {
        title: "Send the link",
        text: "Copy the generated invitation link and send it to the intended person.",
        to: appRoutes.team,
        action: "Open team",
      },
      {
        title: "Review pending invites",
        text: "The Invitations section shows its role and state. Revoke a link that should no longer be used.",
        to: appRoutes.team,
        action: "View invitations",
      },
      {
        title: "Adjust access later",
        text: "After the person joins, change their role or remove them from the Members section when needed.",
        to: appRoutes.team,
        action: "Manage members",
      },
    ],
  },
];

export function currentGuideTopic(pathname: string): GuideTopic | undefined {
  const path = normalizePath(pathname);
  const exact = guideTopics.find((topic) =>
    topic.exactPaths.some((candidate) => candidate === path)
  );
  if (exact) return exact;
  return guideTopics
    .filter((topic) => topic.pathPrefix && path.startsWith(topic.pathPrefix))
    .toSorted((left, right) => (right.pathPrefix?.length ?? 0) - (left.pathPrefix?.length ?? 0))[0];
}

export function canAccessGuideItem(
  access: GuideAccess | undefined,
  teamRole: "owner" | "admin" | "member" | "viewer",
  isGlobalAdmin: boolean
): boolean {
  if (!access || access === "everyone") return true;
  if (access === "global-admin") return isGlobalAdmin;
  return teamRole === "owner" || teamRole === "admin";
}

export function searchableGuideText(topic: GuideTopic): string {
  return [
    topic.title,
    topic.summary,
    ...topic.keywords,
    ...topic.sections.flatMap((section) => [section.title, ...section.items]),
    ...(topic.distinctions?.flatMap((item) => [item.title, item.text]) ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function searchableWorkflowText(workflow: GuideWorkflow): string {
  return [
    workflow.title,
    workflow.summary,
    ...workflow.keywords,
    ...workflow.steps.flatMap((step) => [step.title, step.text]),
  ]
    .join(" ")
    .toLowerCase();
}

function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? pathname;
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
