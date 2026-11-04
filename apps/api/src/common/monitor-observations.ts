import { healthCheckTypes } from "@mimorii/contracts";

const healthCheckTypesSql = healthCheckTypes.map((type) => `'${type}'`).join(", ");
const observationCategorySql = `CASE WHEN c.type IN (${healthCheckTypesSql}) THEN 'health' ELSE 'availability' END`;
const heartbeatDownSql = "he.type IN ('failed', 'missed')";

export const MONITOR_OBSERVATIONS_CTE = `WITH observations AS (
  SELECT c.team_id, c.resource_id, c.id AS check_id,
    ${observationCategorySql} AS category,
    cr.status, cr.latency_ms, cr.checked_at AS observed_at
  FROM check_results cr JOIN checks c ON c.id = cr.check_id
  UNION ALL
  SELECT hm.team_id, hm.resource_id, NULL AS check_id, 'availability' AS category,
    CASE WHEN ${heartbeatDownSql} THEN 'down' ELSE 'up' END AS status,
    NULL AS latency_ms, he.occurred_at AS observed_at
  FROM heartbeat_events he JOIN heartbeat_monitors hm ON hm.id = he.heartbeat_id
  WHERE he.type != 'started'
)`;

export const HOURLY_MONITOR_OBSERVATIONS_CTE = `WITH hourly_observations AS (
  SELECT c.team_id, ${observationCategorySql} AS category,
    h.bucket_start AS observed_at, h.bucket_start,
    h.up_count, h.degraded_count, h.down_count, h.latency_sum, h.latency_count
  FROM check_result_hourly h JOIN checks c ON c.id = h.check_id
  UNION ALL
  SELECT hm.team_id, 'availability', he.occurred_at, date_trunc('hour', he.occurred_at, 'UTC'),
    CASE WHEN ${heartbeatDownSql} THEN 0 ELSE 1 END, 0,
    CASE WHEN ${heartbeatDownSql} THEN 1 ELSE 0 END, 0, 0
  FROM heartbeat_events he JOIN heartbeat_monitors hm ON hm.id = he.heartbeat_id
  WHERE he.type != 'started'
)`;
