import type { CheckConfig, CheckStatus, CheckType } from "@mimorii/contracts";

export interface CheckRow {
  id: string;
  team_id: string;
  resource_id: string;
  name: string;
  type: CheckType;
  config_json: string;
  interval_seconds: number;
  timeout_ms: number;
  failure_threshold: number;
  recovery_threshold: number;
  enabled: number;
  current_status: CheckStatus;
  consecutive_failures: number;
  consecutive_successes: number;
  last_latency_ms: number | null;
  last_checked_at: string | null;
  next_check_at: string | null;
  created_at: string;
  updated_at: string;
  agent_id: string | null;
  encrypted_secret: string | null;
  favicon_request_id: string | null;
}

export interface ExecutedCheckResult {
  status: "up" | "degraded" | "down";
  latencyMs: number | null;
  statusCode: number | null;
  message: string | null;
  metrics: Record<string, number | string | boolean | null>;
  checkedAt: string;
}

export interface RunnableCheck {
  id: string;
  type: CheckType;
  config: CheckConfig;
  secret: string | null;
  timeoutMs: number;
}
