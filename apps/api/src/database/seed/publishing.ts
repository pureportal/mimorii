import { hashSecret } from "../../common/crypto.js";
import {
  at,
  days,
  globalSeedId,
  hours,
  minutes,
  seedId,
  seedSecret,
  type SeedContext,
} from "./context.js";
import type { SeedIdentityIds } from "./identity.js";
import type { SeedMonitoringIds } from "./monitoring.js";
import type { SeedNotificationIds } from "./notifications.js";
import type { SeedOperationsIds } from "./operations.js";

export async function seedPublishing(
  context: SeedContext,
  identity: SeedIdentityIds,
  monitoring: SeedMonitoringIds,
  operations: SeedOperationsIds,
  notifications: SeedNotificationIds
): Promise<void> {
  await seedStatusPages(context, monitoring);
  await seedSponsors(context);
  await seedAudit(context, identity, monitoring, operations, notifications);
}

async function seedStatusPages(context: SeedContext, monitoring: SeedMonitoringIds): Promise<void> {
  const publicPageId = seedId(context, "status-page:public");
  const internalPageId = seedId(context, "status-page:internal");
  const pages = [
    {
      id: publicPageId,
      name: "Mimorii service status",
      slug: `${context.teamKey}-status`,
      published: 1,
      showUptime: 1,
      resources: [
        monitoring.endpointResourceId,
        monitoring.serverResourceId,
        monitoring.serviceResourceId,
        monitoring.pipelineResourceId,
      ],
    },
    {
      id: internalPageId,
      name: "Internal readiness",
      slug: `${context.teamKey}-internal`,
      published: 0,
      showUptime: 0,
      resources: [monitoring.pendingResourceId, monitoring.pausedResourceId],
    },
  ];
  for (const [index, page] of pages.entries()) {
    await context.database.run(
      `INSERT INTO status_pages
       (id, team_id, name, slug, published, show_uptime, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug,
       published = excluded.published, show_uptime = excluded.show_uptime,
       updated_at = excluded.updated_at`,
      page.id,
      context.teamId,
      page.name,
      page.slug,
      page.published,
      page.showUptime,
      context.userId,
      at(context, -days(60 - index * 15)),
      context.now.toISOString()
    );
    for (const [displayOrder, resourceId] of page.resources.entries()) {
      await context.database.run(
        `INSERT INTO status_page_resources (status_page_id, resource_id, display_order)
         VALUES (?, ?, ?)
         ON CONFLICT(status_page_id, resource_id) DO UPDATE SET display_order = excluded.display_order`,
        page.id,
        resourceId,
        displayOrder
      );
    }
  }
  const subscribers = [
    {
      key: "verified",
      email: `subscriber+${context.teamKey}@example.com`,
      verifiedAt: at(context, -days(20)),
      verificationExpiresAt: null,
    },
    {
      key: "pending",
      email: `pending+${context.teamKey}@example.com`,
      verifiedAt: null,
      verificationExpiresAt: at(context, hours(12)),
    },
  ];
  for (const [index, subscriber] of subscribers.entries()) {
    await context.database.run(
      `INSERT INTO status_subscribers
       (id, status_page_id, email, token_hash, verification_expires_at, verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, token_hash = excluded.token_hash,
       verification_expires_at = excluded.verification_expires_at,
       verified_at = excluded.verified_at,
       created_at = excluded.created_at`,
      seedId(context, `status-subscriber:${subscriber.key}`),
      publicPageId,
      subscriber.email,
      subscriber.verifiedAt ? null : hashSecret(seedSecret(context, "mim_status", subscriber.key)),
      subscriber.verificationExpiresAt,
      subscriber.verifiedAt,
      at(context, -days(45 - index * 10))
    );
  }
  const subscriberDeliveries = [
    {
      key: "delivered",
      subscriber: "verified",
      event: "incident.opened",
      status: "delivered",
      attempts: 1,
      next: -days(2),
      error: null,
      delivered: -days(2) + 3_000,
    },
    {
      key: "failed",
      subscriber: "verified",
      event: "incident.updated",
      status: "failed",
      attempts: 5,
      next: -hours(3),
      error: "SMTP rejected the recipient",
      delivered: null,
    },
    {
      key: "pending",
      subscriber: "pending",
      event: "incident.opened",
      status: "pending",
      attempts: 0,
      next: days(30),
      error: null,
      delivered: null,
    },
  ] as const;
  for (const delivery of subscriberDeliveries) {
    await context.database.run(
      `INSERT INTO status_subscriber_deliveries
       (id, subscriber_id, event, payload_json, status, attempts, next_attempt_at,
        error, delivered_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET event = excluded.event, payload_json = excluded.payload_json,
       status = excluded.status, attempts = excluded.attempts,
       next_attempt_at = excluded.next_attempt_at, error = excluded.error,
       delivered_at = excluded.delivered_at, created_at = excluded.created_at`,
      seedId(context, `status-delivery:${delivery.key}`),
      seedId(context, `status-subscriber:${delivery.subscriber}`),
      delivery.event,
      JSON.stringify({ title: "Seeded status update", statusPageId: publicPageId }),
      delivery.status,
      delivery.attempts,
      at(context, delivery.next),
      delivery.error,
      delivery.delivered === null ? null : at(context, delivery.delivered),
      at(context, delivery.next - hours(1))
    );
  }
}

async function seedSponsors(context: SeedContext): Promise<void> {
  const sponsors = [
    {
      key: "platinum",
      name: "Northstar Systems",
      tier: "platinum",
      website: "https://example.com/northstar",
      order: 0,
      published: at(context, -days(90)),
    },
    {
      key: "gold",
      name: "Kite Operations",
      tier: "gold",
      website: "https://example.com/kite",
      order: 0,
      published: at(context, -days(70)),
    },
    {
      key: "silver",
      name: "Riverbed Labs",
      tier: "silver",
      website: null,
      order: 0,
      published: at(context, -days(40)),
    },
    {
      key: "draft",
      name: "Draft Sponsor",
      tier: "silver",
      website: "https://example.com/draft",
      order: 10,
      published: null,
    },
  ] as const;
  for (const [index, sponsor] of sponsors.entries()) {
    await context.database.run(
      `INSERT INTO sponsors
       (id, name, tier, website_url, display_order, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, tier = excluded.tier,
       website_url = excluded.website_url, display_order = excluded.display_order,
       published_at = excluded.published_at`,
      globalSeedId(`sponsor:${sponsor.key}`),
      sponsor.name,
      sponsor.tier,
      sponsor.website,
      sponsor.order,
      sponsor.published,
      at(context, -days(100 - index * 10))
    );
  }
  const applications = [
    {
      key: "platinum",
      organization: "Orbit Cloud",
      contact: "Ari Chen",
      email: "ari@orbit.example",
      website: "https://example.com/orbit",
      tier: "platinum",
      message: "Interested in supporting self-hosted observability.",
    },
    {
      key: "gold",
      organization: "Marina Data",
      contact: "Jo Miller",
      email: "jo@marina.example",
      website: null,
      tier: "gold",
      message: null,
    },
    {
      key: "silver",
      organization: "Pinecone Hosting",
      contact: "Rae Singh",
      email: "rae@pinecone.example",
      website: "https://example.com/pinecone",
      tier: "silver",
      message: "Please send the sponsorship details.",
    },
  ] as const;
  for (const [index, application] of applications.entries()) {
    await context.database.run(
      `INSERT INTO sponsorship_applications
       (id, organization_name, contact_name, email, website_url, tier, message, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET organization_name = excluded.organization_name,
       contact_name = excluded.contact_name, email = excluded.email,
       website_url = excluded.website_url, tier = excluded.tier,
       message = excluded.message, submitted_at = excluded.submitted_at`,
      globalSeedId(`sponsorship-application:${application.key}`),
      application.organization,
      application.contact,
      application.email,
      application.website,
      application.tier,
      application.message,
      at(context, -days(12 - index * 3))
    );
  }
}

async function seedAudit(
  context: SeedContext,
  identity: SeedIdentityIds,
  monitoring: SeedMonitoringIds,
  operations: SeedOperationsIds,
  notifications: SeedNotificationIds
): Promise<void> {
  const events = [
    {
      key: "resource",
      userId: context.userId,
      action: "resource.created",
      subjectType: "resource",
      subjectId: monitoring.serverResourceId,
      metadata: { kind: "server" },
      offset: -days(90),
    },
    {
      key: "check",
      userId: identity.adminUserId,
      action: "check.created",
      subjectType: "check",
      subjectId: monitoring.httpCheckId,
      metadata: { type: "http" },
      offset: -days(80),
    },
    {
      key: "incident",
      userId: identity.memberUserId,
      action: "incident.created",
      subjectType: "incident",
      subjectId: operations.identifiedIncidentId,
      metadata: { impact: "major" },
      offset: -hours(3),
    },
    {
      key: "maintenance",
      userId: context.userId,
      action: "maintenance.created",
      subjectType: "maintenance",
      subjectId: operations.activeMaintenanceId,
      metadata: { resources: 1 },
      offset: -days(30),
    },
    {
      key: "channel",
      userId: identity.adminUserId,
      action: "notification_channel.created",
      subjectType: "notification_channel",
      subjectId: notifications.emailChannelId,
      metadata: { type: "email" },
      offset: -days(70),
    },
    {
      key: "heartbeat",
      userId: null,
      action: "heartbeat.missed",
      subjectType: "heartbeat",
      subjectId: monitoring.missedHeartbeatId,
      metadata: { source: "scheduler" },
      offset: -hours(24),
    },
    {
      key: "agent",
      userId: null,
      action: "agent.heartbeat_received",
      subjectType: "agent",
      subjectId: context.agentId,
      metadata: { results: 2 },
      offset: -minutes(1),
    },
  ] as const;
  for (const event of events) {
    await context.database.run(
      `INSERT INTO audit_events
       (id, team_id, user_id, action, subject_type, subject_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, action = excluded.action,
       subject_type = excluded.subject_type, subject_id = excluded.subject_id,
       metadata_json = excluded.metadata_json, created_at = excluded.created_at`,
      seedId(context, `audit:${event.key}`),
      context.teamId,
      event.userId,
      event.action,
      event.subjectType,
      event.subjectId,
      JSON.stringify(event.metadata),
      at(context, event.offset)
    );
  }
}
