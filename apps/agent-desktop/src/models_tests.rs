use std::collections::BTreeMap;

use serde_json::{Value, json};

use super::{
    AgentPollResponse, AgentTask, CheckState, CheckType, DiskSnapshot, FaviconResult,
    HeartbeatRequest, HeartbeatResponse, HostSnapshot, TaskResult, TechnologySnapshot,
};

fn snapshot() -> HostSnapshot {
    HostSnapshot {
        snapshot_id: "00000000-0000-4000-8000-000000000003".to_owned(),
        hostname: "relay".to_owned(),
        platform: "linux".to_owned(),
        version: "0.1.0".to_owned(),
        uptime_seconds: 120,
        cpu_percent: 25.0,
        load_average: 0.5,
        memory_used_bytes: 5,
        memory_total_bytes: 10,
        swap_used_bytes: 1,
        swap_total_bytes: 2,
        process_count: 3,
        network_received_bytes: 4,
        network_transmitted_bytes: 5,
        disks: vec![DiskSnapshot {
            mount: "/".to_owned(),
            used_bytes: 6,
            total_bytes: 10,
        }],
        technologies: vec![TechnologySnapshot {
            name: "nginx".to_owned(),
            category: "proxy".to_owned(),
            version: None,
        }],
        container_runtime: None,
        observed_at: "2026-08-12T20:00:00Z".to_owned(),
    }
}

#[test]
fn deserializes_every_supported_task_type() {
    for (value, expected) in [
        ("http", CheckType::Http),
        ("tcp", CheckType::Tcp),
        ("dns", CheckType::Dns),
        ("icmp", CheckType::Icmp),
        ("wan", CheckType::Wan),
        ("host", CheckType::Host),
        ("docker", CheckType::Docker),
        ("database", CheckType::Database),
    ] {
        let task: AgentTask = serde_json::from_value(json!({
            "id": "task",
            "checkId": "check",
            "type": value,
            "timeoutMs": 5000,
            "config": {},
            "secret": null,
            "faviconRequestId": "b6e4cb23-3b08-49c7-8163-45e4cce6040f",
            "issuedAt": "2026-08-12T20:00:00Z"
        }))
        .unwrap();
        assert_eq!(task.check_type, expected);
        assert_eq!(task._check_id, "check");
        assert_eq!(task._issued_at, "2026-08-12T20:00:00Z");
        assert_eq!(
            task.favicon_request_id.as_deref(),
            Some("b6e4cb23-3b08-49c7-8163-45e4cce6040f")
        );
    }
}

#[test]
fn rejects_unknown_and_mis_cased_task_types() {
    for value in ["command", "HTTP"] {
        let result = serde_json::from_value::<AgentTask>(json!({
            "id": "task",
            "checkId": "check",
            "type": value,
            "timeoutMs": 5000,
            "config": {},
            "secret": null,
            "faviconRequestId": null,
            "issuedAt": "2026-08-12T20:00:00Z"
        }));
        assert!(result.is_err());
    }
}

#[test]
fn deserializes_poll_configuration_and_trigger_tasks() {
    let response: AgentPollResponse = serde_json::from_value(json!({
        "collectionIntervalSeconds": 45,
        "collectHostTelemetry": true,
        "tasks": [{
            "id": "task",
            "checkId": "check",
            "type": "host",
            "timeoutMs": 5000,
            "config": {},
            "secret": null,
            "faviconRequestId": null,
            "issuedAt": "2026-08-12T20:00:00Z"
        }]
    }))
    .unwrap();
    assert_eq!(response.collection_interval_seconds, 45);
    assert_eq!(response.tasks.len(), 1);
}

#[test]
fn serializes_heartbeat_payloads_with_transport_field_names() {
    let heartbeat = HeartbeatRequest {
        agent_version: env!("CARGO_PKG_VERSION"),
        snapshots: vec![snapshot()],
        results: vec![TaskResult {
            task_id: "task".to_owned(),
            status: CheckState::Degraded,
            latency_ms: Some(12.3),
            status_code: Some(200),
            message: Some("Slow".to_owned()),
            metrics: BTreeMap::from([("responseBytes".to_owned(), json!(128))]),
            checked_at: "2026-08-12T20:00:01Z".to_owned(),
            favicon: Some(FaviconResult::Retrieved {
                request_id: "b6e4cb23-3b08-49c7-8163-45e4cce6040f".to_owned(),
                data_base64: "aWNvbg==".to_owned(),
            }),
        }],
        capabilities: vec!["http"],
    };

    let value = serde_json::to_value(heartbeat).unwrap();

    assert_eq!(value["agentVersion"], env!("CARGO_PKG_VERSION"));
    assert_eq!(value["snapshots"][0]["uptimeSeconds"], 120);
    assert_eq!(value["snapshots"][0]["memoryUsedBytes"], 5);
    assert_eq!(value["snapshots"][0]["disks"][0]["usedBytes"], 6);
    assert_eq!(
        value["snapshots"][0]["technologies"][0]["version"],
        Value::Null
    );
    assert_eq!(value["results"][0]["taskId"], "task");
    assert_eq!(value["results"][0]["status"], "degraded");
    assert_eq!(value["results"][0]["checkedAt"], "2026-08-12T20:00:01Z");
    assert_eq!(value["results"][0]["favicon"]["status"], "retrieved");
    assert_eq!(value["results"][0]["favicon"]["dataBase64"], "aWNvbg==");
}

#[test]
fn deserializes_heartbeat_acknowledgements() {
    let response: HeartbeatResponse = serde_json::from_value(json!({
        "acceptedAt": "2026-08-12T20:00:02Z",
        "acceptedSnapshots": 4,
        "acceptedResults": 3
    }))
    .unwrap();
    assert_eq!(response.accepted_at, "2026-08-12T20:00:02Z");
    assert_eq!(response.accepted_snapshots, 4);
    assert_eq!(response.accepted_results, 3);
}
