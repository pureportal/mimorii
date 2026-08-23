use std::collections::BTreeMap;
use std::time::Duration;

use serde_json::{Value, json};

use super::{ApiClient, user_agent};
use crate::config::AgentConfig;
use crate::models::{
    CheckState, DiskSnapshot, HeartbeatRequest, HostSnapshot, TaskResult, TechnologySnapshot,
};
use crate::target_policy::TargetPolicy;
use crate::test_support::{MockResponse, http_server, tcp_listener};

fn config(server_url: String) -> AgentConfig {
    AgentConfig {
        server_url: format!("{server_url}/api"),
        agent_key: "mim_agent_1234567890123456789012345678901234567890".to_owned(),
        target_policy: TargetPolicy::default(),
    }
}

fn snapshot() -> HostSnapshot {
    HostSnapshot {
        snapshot_id: "00000000-0000-4000-8000-000000000001".to_owned(),
        hostname: "relay-01".to_owned(),
        platform: "test platform".to_owned(),
        version: "0.1.0".to_owned(),
        uptime_seconds: 600,
        cpu_percent: 12.5,
        load_average: 0.4,
        memory_used_bytes: 4_000,
        memory_total_bytes: 8_000,
        swap_used_bytes: 100,
        swap_total_bytes: 1_000,
        process_count: 42,
        network_received_bytes: 10_000,
        network_transmitted_bytes: 5_000,
        disks: vec![DiskSnapshot {
            mount: "/".to_owned(),
            used_bytes: 20_000,
            total_bytes: 100_000,
        }],
        technologies: vec![TechnologySnapshot {
            name: "postgres".to_owned(),
            category: "database".to_owned(),
            version: Some("16".to_owned()),
        }],
        container_runtime: None,
        observed_at: "2026-08-12T20:00:00Z".to_owned(),
    }
}

#[test]
fn poll_authenticates_clamps_the_limit_and_deserializes_configuration_and_tasks() {
    let server = http_server(vec![MockResponse::new(
        200,
        json!({
            "collectionIntervalSeconds": 45,
            "tasks": [{
                "id": "task-1",
                "checkId": "check-1",
                "type": "tcp",
                "timeoutMs": 2500,
                "config": { "target": { "host": "database.internal", "port": 5432 } },
                "secret": null,
                "issuedAt": "2026-08-12T20:00:00Z"
            }]
        })
        .to_string(),
    )]);
    let client = ApiClient::new(config(server.url)).unwrap();

    let response = client.poll(usize::MAX).unwrap();

    assert_eq!(response.collection_interval_seconds, 45);
    assert_eq!(response.tasks.len(), 1);
    assert_eq!(response.tasks[0].id, "task-1");
    let request = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    assert!(request.starts_with("GET /api/agent/tasks?limit=100 HTTP/1.1"));
    assert!(request.contains("authorization: Bearer mim_agent_"));
    assert!(request.contains(&format!("user-agent: {}", user_agent())));
}

#[test]
fn verify_polls_one_task() {
    let server = http_server(vec![MockResponse::new(
        200,
        r#"{"collectionIntervalSeconds":30,"tasks":[]}"#,
    )]);
    let client = ApiClient::new(config(server.url)).unwrap();

    client.verify().unwrap();

    let request = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    assert!(request.starts_with("GET /api/agent/tasks?limit=1 HTTP/1.1"));
}

#[test]
fn poll_rejects_bare_task_arrays() {
    let server = http_server(vec![MockResponse::new(200, "[]")]);
    let error = ApiClient::new(config(server.url))
        .unwrap()
        .poll(1)
        .unwrap_err();

    assert_eq!(error.to_string(), "agent poll response is invalid");
}

#[test]
fn heartbeat_serializes_every_snapshot_and_result_field() {
    let server = http_server(vec![MockResponse::new(
        200,
        r#"{"acceptedAt":"2026-08-12T20:00:01Z","acceptedSnapshots":1,"acceptedResults":1}"#,
    )]);
    let client = ApiClient::new(config(server.url)).unwrap();
    let heartbeat = HeartbeatRequest {
        agent_version: env!("CARGO_PKG_VERSION"),
        snapshots: vec![snapshot()],
        results: vec![TaskResult {
            task_id: "task-1".to_owned(),
            status: CheckState::Up,
            latency_ms: Some(12.4),
            status_code: Some(200),
            message: None,
            metrics: BTreeMap::from([("port".to_owned(), json!(5432))]),
            checked_at: "2026-08-12T20:00:00Z".to_owned(),
        }],
        capabilities: vec!["http", "tcp", "dns", "host", "disk"],
    };

    let response = client.heartbeat(&heartbeat).unwrap();

    assert_eq!(response.accepted_at, "2026-08-12T20:00:01Z");
    assert_eq!(response.accepted_snapshots, 1);
    assert_eq!(response.accepted_results, 1);
    let request = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    assert!(request.starts_with("POST /api/agent/heartbeat HTTP/1.1"));
    assert!(request.contains("content-type: application/json"));
    let body = request.split_once("\r\n\r\n").unwrap().1;
    let payload: Value = serde_json::from_str(body).unwrap();
    assert_eq!(payload["snapshots"][0]["hostname"], "relay-01");
    assert_eq!(payload["snapshots"][0]["disks"][0]["usedBytes"], 20_000);
    assert_eq!(
        payload["snapshots"][0]["technologies"][0]["category"],
        "database"
    );
    assert_eq!(payload["results"][0]["taskId"], "task-1");
    assert_eq!(payload["results"][0]["metrics"]["port"], 5432);
    assert_eq!(
        payload["capabilities"],
        json!(["http", "tcp", "dns", "host", "disk"])
    );
}

#[test]
fn task_and_heartbeat_authentication_failures_are_specific() {
    let tasks_server = http_server(vec![MockResponse::new(401, "rejected")]);
    let tasks_error = ApiClient::new(config(tasks_server.url))
        .unwrap()
        .poll(1)
        .unwrap_err();
    assert_eq!(tasks_error.to_string(), "agent key was rejected");

    let heartbeat_server = http_server(vec![MockResponse::new(401, "rejected")]);
    let heartbeat_error = ApiClient::new(config(heartbeat_server.url))
        .unwrap()
        .heartbeat(&HeartbeatRequest {
            agent_version: env!("CARGO_PKG_VERSION"),
            snapshots: vec![snapshot()],
            results: Vec::new(),
            capabilities: Vec::new(),
        })
        .unwrap_err();
    assert_eq!(heartbeat_error.to_string(), "agent key was rejected");
}

#[test]
fn transport_status_and_payload_errors_are_reported() {
    let status_server = http_server(vec![MockResponse::new(500, "failure")]);
    let status_error = ApiClient::new(config(status_server.url))
        .unwrap()
        .poll(1)
        .unwrap_err();
    assert!(status_error.to_string().contains("500"));

    let tasks_server = http_server(vec![MockResponse::new(200, "not-json")]);
    let tasks_error = ApiClient::new(config(tasks_server.url))
        .unwrap()
        .poll(1)
        .unwrap_err();
    assert_eq!(tasks_error.to_string(), "agent poll response is invalid");

    let heartbeat_server = http_server(vec![MockResponse::new(200, "not-json")]);
    let heartbeat_error = ApiClient::new(config(heartbeat_server.url))
        .unwrap()
        .heartbeat(&HeartbeatRequest {
            agent_version: env!("CARGO_PKG_VERSION"),
            snapshots: vec![snapshot()],
            results: Vec::new(),
            capabilities: Vec::new(),
        })
        .unwrap_err();
    assert_eq!(heartbeat_error.to_string(), "heartbeat response is invalid");
}

#[test]
fn unreachable_servers_preserve_operation_context() {
    let (listener, port) = tcp_listener();
    drop(listener);
    let client = ApiClient::new(config(format!("http://127.0.0.1:{port}"))).unwrap();
    let tasks_error = client.poll(1).unwrap_err();
    assert_eq!(
        tasks_error.to_string(),
        "could not reach the Mimorii server"
    );

    let heartbeat_error = client
        .heartbeat(&HeartbeatRequest {
            agent_version: env!("CARGO_PKG_VERSION"),
            snapshots: vec![snapshot()],
            results: Vec::new(),
            capabilities: Vec::new(),
        })
        .unwrap_err();
    assert_eq!(
        heartbeat_error.to_string(),
        "could not send the agent heartbeat"
    );
}
