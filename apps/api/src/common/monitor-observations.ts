import { healthCheckTypes } from "@mimorii/contracts";

const healthCheckTypesSql = healthCheckTypes.map((type) => `'${type}'`).join(", ");

export const MONITOR_OBSERVATIONS_CTE = `WITH observations AS (
  SELECT c.team_id, c.resource_id, c.id AS check_id,
    CASE WHEN c.type IN (${healthCheckTypesSql}) THEN 'health' ELSE 'availability' END AS category,
    cr.status, cr.latency_ms, cr.checked_at AS observed_at
  FROM check_results cr JOIN checks c ON c.id = cr.check_id
  UNION ALL
  SELECT hm.team_id, hm.resource_id, NULL AS check_id, 'availability' AS category,
    CASE WHEN he.type IN ('failed', 'missed') THEN 'down' ELSE 'up' END AS status,
    NULL AS latency_ms, he.occurred_at AS observed_at
  FROM heartbeat_events he JOIN heartbeat_monitors hm ON hm.id = he.heartbeat_id
  WHERE he.type != 'started'
)`;
