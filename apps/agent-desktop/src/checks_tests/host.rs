use serde_json::json;

use super::{assert_result, snapshot, task};
use crate::models::{CheckState, CheckType, ContainerRuntimeSnapshot, ContainerSnapshot};

fn host_config() -> serde_json::Value {
    json!({
        "cpuWarningPercent": 80,
        "cpuCriticalPercent": 90,
        "memoryWarningPercent": 80,
        "memoryCriticalPercent": 90,
        "loadWarning": 4,
        "loadCritical": 8,
        "swapWarningPercent": 80,
        "swapCriticalPercent": 90
    })
}

fn disk_config(mount: &str) -> serde_json::Value {
    json!({ "mount": mount, "warningPercent": 80, "criticalPercent": 90 })
}

#[test]
fn host_check_reports_up_with_complete_metrics() {
    let result = super::execute(&task(CheckType::Host, host_config()), &snapshot());

    assert_result(&result, CheckState::Up, None, None);
    assert_eq!(result.latency_ms, None);
    assert_eq!(result.metrics["cpuPercent"], 25.0);
    assert_eq!(result.metrics["memoryPercent"], 50.0);
    assert_eq!(result.metrics["loadAverage"], 1.0);
    assert_eq!(result.metrics["swapPercent"], 10.0);
    assert_eq!(result.metrics["processCount"], 42);
}

#[test]
fn every_host_warning_threshold_reports_degraded() {
    for metric in ["cpu", "memory", "load", "swap"] {
        let mut value = snapshot();
        match metric {
            "cpu" => value.cpu_percent = 80.0,
            "memory" => value.memory_used_bytes = 80,
            "load" => value.load_average = 4.0,
            "swap" => value.swap_used_bytes = 80,
            _ => unreachable!(),
        }
        let result = super::execute(&task(CheckType::Host, host_config()), &value);
        assert_result(
            &result,
            CheckState::Degraded,
            Some("A host resource warning threshold was reached"),
            None,
        );
    }
}

#[test]
fn every_host_critical_threshold_reports_down() {
    for metric in ["cpu", "memory", "load", "swap"] {
        let mut value = snapshot();
        match metric {
            "cpu" => value.cpu_percent = 90.0,
            "memory" => value.memory_used_bytes = 90,
            "load" => value.load_average = 8.0,
            "swap" => value.swap_used_bytes = 90,
            _ => unreachable!(),
        }
        let result = super::execute(&task(CheckType::Host, host_config()), &value);
        assert_result(
            &result,
            CheckState::Down,
            Some("A host resource critical threshold was reached"),
            None,
        );
    }
}

#[test]
fn host_check_handles_unavailable_memory_and_swap_totals() {
    let mut value = snapshot();
    value.memory_used_bytes = 500;
    value.memory_total_bytes = 0;
    value.swap_used_bytes = 500;
    value.swap_total_bytes = 0;

    let result = super::execute(&task(CheckType::Host, host_config()), &value);

    assert_result(&result, CheckState::Up, None, None);
    assert_eq!(result.metrics["memoryPercent"], 0.0);
    assert_eq!(result.metrics["swapPercent"], 0.0);
}

#[test]
fn invalid_host_configuration_becomes_a_safe_down_result() {
    let result = super::execute(
        &task(CheckType::Host, json!({ "cpuWarningPercent": "high" })),
        &snapshot(),
    );

    assert_result(
        &result,
        CheckState::Down,
        Some("host configuration is invalid"),
        None,
    );
    assert!(result.metrics.is_empty());
}

#[test]
fn disk_check_matches_windows_drive_roots_and_additional_volumes() {
    let mut value = snapshot();
    value.disks = vec![
        crate::models::DiskSnapshot {
            mount: "c:\\".to_owned(),
            used_bytes: 40,
            total_bytes: 100,
        },
        crate::models::DiskSnapshot {
            mount: "D:/".to_owned(),
            used_bytes: 75,
            total_bytes: 100,
        },
    ];
    let root = super::execute(&task(CheckType::Disk, disk_config("C:")), &value);
    assert_result(&root, CheckState::Up, None, None);
    assert_eq!(root.metrics["usedPercent"], 40.0);

    let result = super::execute(
        &task(
            CheckType::Disk,
            json!({ "mount": "d:", "warningPercent": 70, "criticalPercent": 90 }),
        ),
        &value,
    );
    assert_result(
        &result,
        CheckState::Degraded,
        Some("Disk usage warning threshold was reached"),
        None,
    );
    assert_eq!(result.metrics["usedPercent"], 75.0);
}

#[test]
fn disk_check_matches_windows_network_paths_case_insensitively() {
    let mut value = snapshot();
    value.disks[0].mount = "\\\\SERVER\\Data\\".to_owned();
    let result = super::execute(&task(CheckType::Disk, disk_config("//server/data")), &value);

    assert_result(&result, CheckState::Up, None, None);
    assert_eq!(result.metrics["usedPercent"], 50.0);
}

#[test]
fn disk_check_preserves_critical_threshold_evaluation() {
    let mut value = snapshot();
    value.disks[0].used_bytes = 973;
    value.disks[0].total_bytes = 1_000;

    let result = super::execute(&task(CheckType::Disk, disk_config("/")), &value);

    assert_result(
        &result,
        CheckState::Down,
        Some("Disk usage critical threshold was reached"),
        None,
    );
    assert_eq!(result.metrics["usedPercent"], 97.3);
}

#[test]
fn disk_check_reports_missing_and_inaccessible_volumes() {
    let missing = super::execute(&task(CheckType::Disk, disk_config("/missing")), &snapshot());
    assert_result(
        &missing,
        CheckState::Down,
        Some("Configured disk is unavailable"),
        None,
    );

    let mut value = snapshot();
    value.disks[0].used_bytes = 1;
    value.disks[0].total_bytes = 0;
    let inaccessible = super::execute(&task(CheckType::Disk, disk_config("/")), &value);
    assert_result(
        &inaccessible,
        CheckState::Down,
        Some("Configured disk is unavailable"),
        None,
    );
    assert!(inaccessible.metrics.is_empty());
}

#[test]
fn host_check_can_omit_load_monitoring() {
    let mut config = host_config();
    config.as_object_mut().unwrap().remove("loadWarning");
    config.as_object_mut().unwrap().remove("loadCritical");
    let mut value = snapshot();
    value.load_average = 1_000.0;

    let result = super::execute(&task(CheckType::Host, config), &value);

    assert_result(&result, CheckState::Up, None, None);
    assert!(!result.metrics.contains_key("loadAverage"));
}

fn container(name: &str, state: &str, health: &str) -> ContainerSnapshot {
    ContainerSnapshot {
        id: format!("id-{name}"),
        name: name.to_owned(),
        image: "example:latest".to_owned(),
        state: state.to_owned(),
        health: health.to_owned(),
        restart_count: 0,
        cpu_percent: 10.0,
        memory_used_bytes: 20,
        memory_limit_bytes: 100,
        network_received_bytes: 1,
        network_transmitted_bytes: 2,
        block_read_bytes: 3,
        block_written_bytes: 4,
        compose_project: Some("monitoring".to_owned()),
        compose_service: Some(name.to_owned()),
        ports: vec!["8080:80/tcp".to_owned()],
        started_at: Some("2026-08-23T10:00:00Z".to_owned()),
    }
}

#[test]
fn docker_check_filters_containers_and_reports_health_and_resource_states() {
    let mut value = snapshot();
    value.container_runtime = Some(ContainerRuntimeSnapshot {
        engine_version: "27.5".to_owned(),
        containers: vec![
            container("api", "running", "healthy"),
            container("worker", "running", "healthy"),
        ],
    });
    let config = json!({
        "containerNamePattern": "api*",
        "requireHealthy": true,
        "requireRunning": true,
        "maximumRestarts": 3,
        "cpuWarningPercent": 90,
        "memoryWarningPercent": 90
    });
    let up = super::execute(&task(CheckType::Docker, config.clone()), &value);
    assert_result(&up, CheckState::Up, None, None);
    assert_eq!(up.metrics["containerCount"], 1);

    value.container_runtime.as_mut().unwrap().containers[0].health = "unhealthy".to_owned();
    let down = super::execute(&task(CheckType::Docker, config.clone()), &value);
    assert_result(
        &down,
        CheckState::Down,
        Some("A container is not healthy"),
        None,
    );

    value.container_runtime.as_mut().unwrap().containers[0].health = "healthy".to_owned();
    value.container_runtime.as_mut().unwrap().containers[0].cpu_percent = 95.0;
    let degraded = super::execute(&task(CheckType::Docker, config), &value);
    assert_result(
        &degraded,
        CheckState::Degraded,
        Some("A container resource warning threshold was reached"),
        None,
    );
}

#[test]
fn docker_check_reports_unavailable_and_unmatched_runtimes() {
    let config = json!({
        "containerNamePattern": "missing*",
        "requireHealthy": true,
        "requireRunning": true,
        "maximumRestarts": 3,
        "cpuWarningPercent": 90,
        "memoryWarningPercent": 90
    });
    let unavailable = super::execute(&task(CheckType::Docker, config.clone()), &snapshot());
    assert_result(
        &unavailable,
        CheckState::Down,
        Some("Connection failed"),
        None,
    );

    let mut value = snapshot();
    value.container_runtime = Some(ContainerRuntimeSnapshot {
        engine_version: "27.5".to_owned(),
        containers: vec![container("api", "running", "healthy")],
    });
    let unmatched = super::execute(&task(CheckType::Docker, config), &value);
    assert_result(
        &unmatched,
        CheckState::Down,
        Some("Connection failed"),
        None,
    );
}
