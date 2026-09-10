use std::collections::BTreeMap;

use anyhow::{Context, Result, bail};
use serde::Deserialize;
use serde_json::json;

use crate::host_maintenance;
use crate::models::{AgentTask, CheckState, HostSnapshot, TaskResult};
use crate::time_now;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    cpu_warning_percent: f32,
    cpu_critical_percent: f32,
    memory_warning_percent: f64,
    memory_critical_percent: f64,
    load_warning: Option<f64>,
    load_critical: Option<f64>,
    swap_warning_percent: f64,
    swap_critical_percent: f64,
    #[serde(default)]
    maintenance: host_maintenance::Config,
}

pub(crate) fn execute(task: &AgentTask, snapshot: &HostSnapshot) -> Result<TaskResult> {
    execute_with_assessment(task, snapshot, host_maintenance::assess)
}

pub(crate) fn execute_with_assessment(
    task: &AgentTask,
    snapshot: &HostSnapshot,
    assess: impl FnOnce(&host_maintenance::Config, u64) -> host_maintenance::Report,
) -> Result<TaskResult> {
    let config: Config =
        serde_json::from_value(task.config.clone()).context("host configuration is invalid")?;
    if config.load_warning.is_some() != config.load_critical.is_some() {
        bail!("host configuration is invalid");
    }
    config.maintenance.validate()?;
    let maintenance = assess(&config.maintenance, task.timeout_ms);
    let memory_percent = if snapshot.memory_total_bytes == 0 {
        0.0
    } else {
        snapshot.memory_used_bytes as f64 / snapshot.memory_total_bytes as f64 * 100.0
    };
    let swap_percent = if snapshot.swap_total_bytes == 0 {
        0.0
    } else {
        snapshot.swap_used_bytes as f64 / snapshot.swap_total_bytes as f64 * 100.0
    };
    let critical = snapshot.cpu_percent >= config.cpu_critical_percent
        || memory_percent >= config.memory_critical_percent
        || config
            .load_critical
            .is_some_and(|threshold| snapshot.load_average >= threshold)
        || swap_percent >= config.swap_critical_percent;
    let degraded = snapshot.cpu_percent >= config.cpu_warning_percent
        || memory_percent >= config.memory_warning_percent
        || config
            .load_warning
            .is_some_and(|threshold| snapshot.load_average >= threshold)
        || swap_percent >= config.swap_warning_percent;
    let status = if critical || maintenance.critical() {
        CheckState::Down
    } else if degraded || maintenance.warning() {
        CheckState::Degraded
    } else {
        CheckState::Up
    };
    let resource_message = if critical {
        Some("A host resource critical threshold was reached")
    } else if degraded {
        Some("A host resource warning threshold was reached")
    } else {
        None
    };
    let maintenance_message = maintenance.message();
    let message = match (resource_message, maintenance_message) {
        (Some(resource), Some(maintenance)) => Some(
            format!("{resource}; {maintenance}")
                .chars()
                .take(500)
                .collect(),
        ),
        (Some(resource), None) => Some(resource.to_owned()),
        (None, maintenance) => maintenance,
    };
    let mut metrics = BTreeMap::new();
    metrics.insert("cpuPercent".to_owned(), json!(snapshot.cpu_percent));
    metrics.insert("memoryPercent".to_owned(), json!(memory_percent));
    if config.load_warning.is_some() {
        metrics.insert("loadAverage".to_owned(), json!(snapshot.load_average));
    }
    metrics.insert("swapPercent".to_owned(), json!(swap_percent));
    metrics.insert("processCount".to_owned(), json!(snapshot.process_count));
    metrics.extend(maintenance.metrics);
    Ok(TaskResult {
        task_id: task.id.clone(),
        status,
        latency_ms: None,
        status_code: None,
        message,
        metrics,
        checked_at: time_now(),
        favicon: None,
    })
}
