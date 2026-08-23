mod host;
mod http;
mod network;
mod security;

use serde_json::Value;

use crate::models::{AgentTask, CheckState, CheckType, DiskSnapshot, HostSnapshot, TaskResult};
use crate::target_policy::TargetPolicy;

fn execute(task: &AgentTask, snapshot: &HostSnapshot) -> TaskResult {
    super::execute(task, snapshot, &local_policy())
}

fn http(task: &AgentTask) -> anyhow::Result<TaskResult> {
    super::http(task, &local_policy())
}

fn local_policy() -> TargetPolicy {
    TargetPolicy {
        allowed_cidrs: vec!["127.0.0.0/8".parse().unwrap(), "::1/128".parse().unwrap()],
        ..TargetPolicy::default()
    }
}

fn task(check_type: CheckType, config: Value) -> AgentTask {
    AgentTask {
        id: "task-1".to_owned(),
        _check_id: "check-1".to_owned(),
        check_type,
        timeout_ms: 2_000,
        config,
        secret: None,
        _issued_at: "2026-08-12T20:00:00Z".to_owned(),
    }
}

fn snapshot() -> HostSnapshot {
    HostSnapshot {
        snapshot_id: "00000000-0000-4000-8000-000000000002".to_owned(),
        hostname: "relay-01".to_owned(),
        platform: "test".to_owned(),
        version: "0.1.0".to_owned(),
        uptime_seconds: 600,
        cpu_percent: 25.0,
        load_average: 1.0,
        memory_used_bytes: 50,
        memory_total_bytes: 100,
        swap_used_bytes: 10,
        swap_total_bytes: 100,
        process_count: 42,
        network_received_bytes: 1_000,
        network_transmitted_bytes: 500,
        disks: vec![DiskSnapshot {
            mount: "/".to_owned(),
            used_bytes: 50,
            total_bytes: 100,
        }],
        technologies: Vec::new(),
        container_runtime: None,
        observed_at: "2026-08-12T20:00:00Z".to_owned(),
    }
}

fn assert_result(
    result: &TaskResult,
    status: CheckState,
    message: Option<&str>,
    status_code: Option<u16>,
) {
    assert_eq!(result.task_id, "task-1");
    assert_eq!(result.status, status);
    assert_eq!(result.message.as_deref(), message);
    assert_eq!(result.status_code, status_code);
    assert!(result.checked_at.contains('T'));
}
