use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSnapshot {
    pub mount: String,
    pub used_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TechnologySnapshot {
    pub name: String,
    pub category: String,
    pub version: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerSnapshot {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub health: String,
    pub restart_count: u64,
    pub cpu_percent: f64,
    pub memory_used_bytes: u64,
    pub memory_limit_bytes: u64,
    pub network_received_bytes: u64,
    pub network_transmitted_bytes: u64,
    pub block_read_bytes: u64,
    pub block_written_bytes: u64,
    pub compose_project: Option<String>,
    pub compose_service: Option<String>,
    pub ports: Vec<String>,
    pub started_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerRuntimeSnapshot {
    pub engine_version: String,
    pub containers: Vec<ContainerSnapshot>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostSnapshot {
    pub snapshot_id: String,
    pub hostname: String,
    pub platform: String,
    pub version: String,
    pub uptime_seconds: u64,
    pub cpu_percent: f32,
    pub load_average: f64,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub swap_total_bytes: u64,
    pub process_count: usize,
    pub network_received_bytes: u64,
    pub network_transmitted_bytes: u64,
    pub disks: Vec<DiskSnapshot>,
    pub technologies: Vec<TechnologySnapshot>,
    pub container_runtime: Option<ContainerRuntimeSnapshot>,
    pub observed_at: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTask {
    pub id: String,
    #[serde(rename = "checkId")]
    pub _check_id: String,
    #[serde(rename = "type")]
    pub check_type: CheckType,
    pub timeout_ms: u64,
    pub config: Value,
    pub secret: Option<String>,
    #[serde(rename = "issuedAt")]
    pub _issued_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPollResponse {
    pub collection_interval_seconds: u64,
    pub tasks: Vec<AgentTask>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CheckType {
    Http,
    Tcp,
    Dns,
    Icmp,
    Wan,
    Host,
    Disk,
    Docker,
    Database,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResult {
    pub task_id: String,
    pub status: CheckState,
    pub latency_ms: Option<f64>,
    pub status_code: Option<u16>,
    pub message: Option<String>,
    pub metrics: BTreeMap<String, Value>,
    pub checked_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckState {
    Up,
    Degraded,
    Down,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatRequest {
    pub agent_version: &'static str,
    pub snapshots: Vec<HostSnapshot>,
    pub results: Vec<TaskResult>,
    pub capabilities: Vec<&'static str>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatResponse {
    pub accepted_at: String,
    pub accepted_snapshots: usize,
    pub accepted_results: usize,
}

#[cfg(test)]
#[path = "models_tests.rs"]
mod tests;
