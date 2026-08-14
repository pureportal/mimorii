import { Migration } from "@mikro-orm/migrations";

export class Migration20260812000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        token_version INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE team_members (
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
        joined_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (team_id, user_id)
      );

      CREATE TABLE team_invites (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
        token_hash TEXT NOT NULL UNIQUE,
        invited_by TEXT NOT NULL REFERENCES users(id),
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE agents (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        platform TEXT,
        version TEXT,
        capabilities_json TEXT NOT NULL DEFAULT '[]',
        last_seen_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE resources (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('server', 'service', 'endpoint')),
        target TEXT NOT NULL,
        description TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE checks (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('http', 'tcp', 'dns', 'host', 'disk')),
        config_json TEXT NOT NULL,
        interval_seconds INTEGER NOT NULL CHECK (interval_seconds BETWEEN 30 AND 86400),
        timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 250 AND 30000),
        failure_threshold INTEGER NOT NULL DEFAULT 2 CHECK (failure_threshold BETWEEN 1 AND 10),
        recovery_threshold INTEGER NOT NULL DEFAULT 1 CHECK (recovery_threshold BETWEEN 1 AND 10),
        enabled INTEGER NOT NULL DEFAULT 1,
        current_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (current_status IN ('pending', 'up', 'degraded', 'down', 'paused')),
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        consecutive_successes INTEGER NOT NULL DEFAULT 0,
        last_latency_ms REAL,
        last_checked_at TIMESTAMPTZ,
        next_check_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE check_results (
        id TEXT PRIMARY KEY,
        check_id TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('up', 'degraded', 'down')),
        latency_ms REAL,
        status_code INTEGER,
        message TEXT,
        metrics_json TEXT NOT NULL DEFAULT '{}',
        checked_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE heartbeat_monitors (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        interval_seconds INTEGER NOT NULL CHECK (interval_seconds BETWEEN 60 AND 2592000),
        grace_seconds INTEGER NOT NULL CHECK (grace_seconds BETWEEN 0 AND 86400),
        max_runtime_seconds INTEGER CHECK (
          max_runtime_seconds IS NULL OR max_runtime_seconds BETWEEN 60 AND 2592000
        ),
        enabled INTEGER NOT NULL DEFAULT 1,
        current_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (current_status IN ('pending', 'up', 'down', 'paused')),
        last_ping_at TIMESTAMPTZ,
        last_started_at TIMESTAMPTZ,
        running_since TIMESTAMPTZ,
        next_expected_at TIMESTAMPTZ,
        last_duration_ms REAL CHECK (last_duration_ms IS NULL OR last_duration_ms >= 0),
        last_message TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE incidents (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        source TEXT NOT NULL CHECK (source IN ('automatic', 'manual')),
        check_id TEXT REFERENCES checks(id) ON DELETE SET NULL,
        heartbeat_id TEXT REFERENCES heartbeat_monitors(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        impact TEXT NOT NULL CHECK (impact IN ('minor', 'major', 'critical')),
        status TEXT NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
        started_at TIMESTAMPTZ NOT NULL,
        acknowledged_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        opening_result_id TEXT REFERENCES check_results(id) ON DELETE SET NULL,
        closing_result_id TEXT REFERENCES check_results(id) ON DELETE SET NULL,
        notifications_suppressed INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE agent_tasks (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        check_id TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'completed', 'expired')),
        issued_at TIMESTAMPTZ NOT NULL,
        claimed_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      );

      CREATE TABLE host_snapshots (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        snapshot_json TEXT NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE incident_resources (
        incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        PRIMARY KEY (incident_id, resource_id)
      );

      CREATE TABLE incident_updates (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
        message TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE maintenance_windows (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
        recurrence_until TIMESTAMPTZ,
        suppress_notifications INTEGER NOT NULL DEFAULT 1,
        cancelled_at TIMESTAMPTZ,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE maintenance_resources (
        maintenance_id TEXT NOT NULL REFERENCES maintenance_windows(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        PRIMARY KEY (maintenance_id, resource_id)
      );

      CREATE TABLE maintenance_occurrence_events (
        maintenance_id TEXT NOT NULL REFERENCES maintenance_windows(id) ON DELETE CASCADE,
        occurrence_start TIMESTAMPTZ NOT NULL,
        event TEXT NOT NULL CHECK (event IN ('started', 'completed')),
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (maintenance_id, occurrence_start, event)
      );

      CREATE TABLE notification_channels (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('email', 'webhook')),
        configuration_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE notification_deliveries (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
        event TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL,
        error TEXT,
        delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE status_pages (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        published INTEGER NOT NULL DEFAULT 0,
        show_uptime INTEGER NOT NULL DEFAULT 1,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE status_page_resources (
        status_page_id TEXT NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        display_order INTEGER NOT NULL,
        PRIMARY KEY (status_page_id, resource_id)
      );

      CREATE TABLE status_subscribers (
        id TEXT PRIMARY KEY,
        status_page_id TEXT NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        verified_at TIMESTAMPTZ,
        unsubscribed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE status_subscriber_deliveries (
        id TEXT PRIMARY KEY,
        subscriber_id TEXT NOT NULL REFERENCES status_subscribers(id) ON DELETE CASCADE,
        event TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL,
        error TEXT,
        delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE service_level_objectives (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
        check_id TEXT REFERENCES checks(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        target_percent REAL NOT NULL CHECK (target_percent >= 90 AND target_percent < 100),
        window_days INTEGER NOT NULL CHECK (window_days IN (7, 30, 90)),
        latency_target_ms REAL CHECK (latency_target_ms IS NULL OR latency_target_ms > 0),
        breach_state TEXT NOT NULL DEFAULT 'no-data' CHECK (breach_state IN ('met', 'at-risk', 'breached', 'no-data')),
        last_evaluated_at TIMESTAMPTZ,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        CHECK (resource_id IS NOT NULL OR check_id IS NOT NULL)
      );

      CREATE TABLE technology_observations (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('runtime', 'framework', 'database', 'proxy', 'container', 'protocol', 'other')),
        version TEXT,
        source TEXT NOT NULL CHECK (source IN ('http', 'agent')),
        first_seen_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        UNIQUE (resource_id, name, category, version, source)
      );

      CREATE TABLE heartbeat_events (
        id TEXT PRIMARY KEY,
        heartbeat_id TEXT NOT NULL REFERENCES heartbeat_monitors(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('started', 'succeeded', 'failed', 'missed')),
        duration_ms REAL CHECK (duration_ms IS NULL OR duration_ms >= 0),
        message TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        occurred_at TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE notification_policies (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        events_json TEXT NOT NULL,
        minimum_impact TEXT CHECK (minimum_impact IN ('minor', 'major', 'critical')),
        resource_tags_json TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE notification_policy_channels (
        policy_id TEXT NOT NULL REFERENCES notification_policies(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
        PRIMARY KEY (policy_id, channel_id)
      );

      CREATE TABLE api_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        token_prefix TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE sponsors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tier TEXT NOT NULL CHECK (tier IN ('platinum', 'gold', 'silver')),
        website_url TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE sponsorship_applications (
        id TEXT PRIMARY KEY,
        organization_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT NOT NULL,
        website_url TEXT,
        tier TEXT NOT NULL CHECK (tier IN ('platinum', 'gold', 'silver')),
        message TEXT,
        submitted_at TIMESTAMPTZ NOT NULL
      );

      CREATE UNIQUE INDEX users_email_unique ON users (LOWER(email));
      CREATE UNIQUE INDEX teams_slug_unique ON teams (LOWER(slug));
      CREATE UNIQUE INDEX status_pages_slug_unique ON status_pages (LOWER(slug));
      CREATE UNIQUE INDEX status_subscribers_page_email_unique
        ON status_subscribers (status_page_id, LOWER(email));

      CREATE INDEX idx_team_members_user ON team_members(user_id);
      CREATE INDEX idx_resources_team ON resources(team_id, created_at);
      CREATE INDEX idx_checks_due ON checks(enabled, next_check_at);
      CREATE INDEX idx_checks_team ON checks(team_id, resource_id);
      CREATE INDEX idx_results_check_time ON check_results(check_id, checked_at DESC);
      CREATE INDEX idx_incidents_check_open ON incidents(check_id, resolved_at);
      CREATE INDEX idx_agent_tasks_poll ON agent_tasks(agent_id, status, issued_at);
      CREATE INDEX idx_host_snapshots_agent_time ON host_snapshots(agent_id, observed_at DESC);
      CREATE INDEX idx_audit_team_time ON audit_events(team_id, created_at DESC);
      CREATE INDEX idx_incidents_team_time ON incidents(team_id, started_at DESC);
      CREATE INDEX idx_incidents_check_status ON incidents(check_id, status);
      CREATE INDEX idx_incident_updates_time ON incident_updates(incident_id, created_at);
      CREATE INDEX idx_maintenance_team_time ON maintenance_windows(team_id, starts_at);
      CREATE INDEX idx_maintenance_resources_resource ON maintenance_resources(resource_id, maintenance_id);
      CREATE INDEX idx_notification_channels_team ON notification_channels(team_id, enabled);
      CREATE INDEX idx_notification_delivery_queue ON notification_deliveries(status, next_attempt_at);
      CREATE INDEX idx_notification_delivery_team ON notification_deliveries(team_id, created_at DESC);
      CREATE INDEX idx_status_pages_team ON status_pages(team_id, created_at);
      CREATE INDEX idx_status_page_resources_order ON status_page_resources(status_page_id, display_order);
      CREATE INDEX idx_status_subscriber_delivery_queue ON status_subscriber_deliveries(status, next_attempt_at);
      CREATE INDEX idx_slo_team ON service_level_objectives(team_id, created_at);
      CREATE INDEX idx_technologies_resource ON technology_observations(resource_id, last_seen_at DESC);
      CREATE INDEX idx_results_time ON check_results(checked_at);
      CREATE INDEX idx_host_snapshots_time ON host_snapshots(observed_at);
      CREATE INDEX idx_audit_time ON audit_events(created_at);
      CREATE INDEX idx_agent_tasks_time ON agent_tasks(status, issued_at);
      CREATE INDEX idx_notification_delivery_time ON notification_deliveries(created_at);
      CREATE INDEX idx_subscriber_delivery_time ON status_subscriber_deliveries(created_at);
      CREATE INDEX idx_team_invites_pending ON team_invites(team_id, created_at DESC)
        WHERE accepted_at IS NULL;
      CREATE INDEX idx_status_subscribers_page ON status_subscribers(status_page_id, created_at DESC);
      CREATE INDEX idx_heartbeat_team ON heartbeat_monitors(team_id, created_at);
      CREATE INDEX idx_heartbeat_resource ON heartbeat_monitors(resource_id, created_at);
      CREATE INDEX idx_heartbeat_due ON heartbeat_monitors(enabled, next_expected_at);
      CREATE INDEX idx_heartbeat_events_time ON heartbeat_events(heartbeat_id, occurred_at DESC);
      CREATE INDEX idx_heartbeat_events_retention ON heartbeat_events(received_at);
      CREATE INDEX idx_incidents_heartbeat ON incidents(heartbeat_id, status);
      CREATE UNIQUE INDEX idx_incidents_heartbeat_open ON incidents(heartbeat_id)
        WHERE heartbeat_id IS NOT NULL AND status != 'resolved';
      CREATE INDEX idx_notification_policies_team ON notification_policies(team_id, enabled);
      CREATE INDEX idx_notification_policy_channels_channel
        ON notification_policy_channels(channel_id, policy_id);
      CREATE INDEX idx_api_tokens_user ON api_tokens(user_id, created_at DESC);
      CREATE INDEX idx_sponsors_public
        ON sponsors(tier, display_order, LOWER(name))
        WHERE published_at IS NOT NULL;
      CREATE INDEX idx_sponsorship_applications_time
        ON sponsorship_applications(submitted_at DESC);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP TABLE IF EXISTS api_tokens CASCADE;
      DROP TABLE IF EXISTS notification_policy_channels CASCADE;
      DROP TABLE IF EXISTS notification_policies CASCADE;
      DROP TABLE IF EXISTS heartbeat_events CASCADE;
      DROP TABLE IF EXISTS sponsorship_applications CASCADE;
      DROP TABLE IF EXISTS sponsors CASCADE;
      DROP TABLE IF EXISTS technology_observations CASCADE;
      DROP TABLE IF EXISTS service_level_objectives CASCADE;
      DROP TABLE IF EXISTS status_subscriber_deliveries CASCADE;
      DROP TABLE IF EXISTS status_subscribers CASCADE;
      DROP TABLE IF EXISTS status_page_resources CASCADE;
      DROP TABLE IF EXISTS status_pages CASCADE;
      DROP TABLE IF EXISTS notification_deliveries CASCADE;
      DROP TABLE IF EXISTS notification_channels CASCADE;
      DROP TABLE IF EXISTS maintenance_occurrence_events CASCADE;
      DROP TABLE IF EXISTS maintenance_resources CASCADE;
      DROP TABLE IF EXISTS maintenance_windows CASCADE;
      DROP TABLE IF EXISTS incident_updates CASCADE;
      DROP TABLE IF EXISTS incident_resources CASCADE;
      DROP TABLE IF EXISTS audit_events CASCADE;
      DROP TABLE IF EXISTS host_snapshots CASCADE;
      DROP TABLE IF EXISTS agent_tasks CASCADE;
      DROP TABLE IF EXISTS incidents CASCADE;
      DROP TABLE IF EXISTS heartbeat_monitors CASCADE;
      DROP TABLE IF EXISTS check_results CASCADE;
      DROP TABLE IF EXISTS checks CASCADE;
      DROP TABLE IF EXISTS resources CASCADE;
      DROP TABLE IF EXISTS agents CASCADE;
      DROP TABLE IF EXISTS team_invites CASCADE;
      DROP TABLE IF EXISTS team_members CASCADE;
      DROP TABLE IF EXISTS teams CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);
  }
}
