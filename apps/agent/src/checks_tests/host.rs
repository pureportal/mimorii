use serde_json::json;

use super::{assert_result, snapshot, task};
use crate::models::{CheckState, CheckType};

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

#[test]
fn host_check_reports_up_with_complete_metrics() {
    let result = super::super::execute(&task(CheckType::Host, host_config()), &snapshot());

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
        let result = super::super::execute(&task(CheckType::Host, host_config()), &value);
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
        let result = super::super::execute(&task(CheckType::Host, host_config()), &value);
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

    let result = super::super::execute(&task(CheckType::Host, host_config()), &value);

    assert_result(&result, CheckState::Up, None, None);
    assert_eq!(result.metrics["memoryPercent"], 0.0);
    assert_eq!(result.metrics["swapPercent"], 0.0);
}

#[test]
fn invalid_host_configuration_becomes_a_safe_down_result() {
    let result = super::super::execute(
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

fn disk_config(warning: f64, critical: f64) -> serde_json::Value {
    json!({ "mount": "/", "warningPercent": warning, "criticalPercent": critical })
}

#[test]
fn disk_check_reports_up_warning_and_critical_states() {
    let up = super::super::execute(&task(CheckType::Disk, disk_config(80.0, 90.0)), &snapshot());
    assert_result(&up, CheckState::Up, None, None);
    assert_eq!(up.metrics["usedPercent"], 50.0);
    assert_eq!(up.metrics["usedBytes"], 50);
    assert_eq!(up.metrics["totalBytes"], 100);

    let degraded =
        super::super::execute(&task(CheckType::Disk, disk_config(50.0, 90.0)), &snapshot());
    assert_result(
        &degraded,
        CheckState::Degraded,
        Some("Disk usage warning threshold was reached"),
        None,
    );

    let down = super::super::execute(&task(CheckType::Disk, disk_config(40.0, 50.0)), &snapshot());
    assert_result(
        &down,
        CheckState::Down,
        Some("Disk usage critical threshold was reached"),
        None,
    );
}

#[test]
fn disk_mount_matching_is_case_insensitive() {
    let mut value = snapshot();
    value.disks[0].mount = "DATA".to_owned();
    let result = super::super::execute(
        &task(
            CheckType::Disk,
            json!({ "mount": "data", "warningPercent": 80, "criticalPercent": 90 }),
        ),
        &value,
    );
    assert_result(&result, CheckState::Up, None, None);
}

#[test]
fn disk_check_handles_zero_capacity() {
    let mut value = snapshot();
    value.disks[0].used_bytes = 1;
    value.disks[0].total_bytes = 0;
    let result = super::super::execute(&task(CheckType::Disk, disk_config(80.0, 90.0)), &value);
    assert_result(&result, CheckState::Up, None, None);
    assert_eq!(result.metrics["usedPercent"], 0.0);
}

#[test]
fn disk_check_reports_missing_mounts_and_invalid_configuration() {
    let missing = super::super::execute(
        &task(
            CheckType::Disk,
            json!({ "mount": "/missing", "warningPercent": 80, "criticalPercent": 90 }),
        ),
        &snapshot(),
    );
    assert_result(&missing, CheckState::Down, Some("Connection failed"), None);

    let invalid = super::super::execute(&task(CheckType::Disk, json!({})), &snapshot());
    assert_result(
        &invalid,
        CheckState::Down,
        Some("disk configuration is invalid"),
        None,
    );
}
