use std::path::PathBuf;

use serde::Deserialize;

use crate::theme::Tone;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ServiceState {
    Running,
    Starting,
    Stopping,
    Paused,
    Stopped,
    Failed,
    NotInstalled,
}

impl ServiceState {
    pub fn label(self) -> &'static str {
        match self {
            Self::Running => "Running",
            Self::Starting => "Starting",
            Self::Stopping => "Stopping",
            Self::Paused => "Paused",
            Self::Stopped => "Stopped",
            Self::Failed => "Failed",
            Self::NotInstalled => "Not installed",
        }
    }

    pub fn tone(self) -> Tone {
        match self {
            Self::Running => Tone::Success,
            Self::Starting | Self::Stopping | Self::Paused => Tone::Warning,
            Self::Stopped | Self::Failed | Self::NotInstalled => Tone::Danger,
        }
    }

    pub fn can_start(self) -> bool {
        matches!(self, Self::Stopped | Self::Failed)
    }

    pub fn can_stop(self) -> bool {
        matches!(self, Self::Running | Self::Paused)
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub agent_version: String,
    pub service: ServiceState,
    pub enrolled: bool,
    pub server_url: Option<String>,
    pub target_policy: Option<TargetPolicy>,
    pub configuration_error: Option<String>,
    pub runtime: Option<RuntimeStatus>,
    pub log_path: PathBuf,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub last_contact_seconds_ago: Option<u64>,
    pub last_upload_seconds_ago: Option<u64>,
    pub last_error: Option<String>,
    pub last_error_seconds_ago: Option<u64>,
    pub pending_snapshots: usize,
    pub recent_checks: Vec<CheckActivity>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CheckStatus {
    Up,
    Degraded,
    Down,
}

impl CheckStatus {
    pub fn label(self) -> &'static str {
        match self {
            Self::Up => "Up",
            Self::Degraded => "Degraded",
            Self::Down => "Down",
        }
    }

    pub fn tone(self) -> Tone {
        match self {
            Self::Up => Tone::Success,
            Self::Degraded => Tone::Warning,
            Self::Down => Tone::Danger,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckActivity {
    pub checked_seconds_ago: u64,
    pub check_type: String,
    pub target: String,
    pub status: CheckStatus,
    pub latency_ms: Option<f64>,
    pub message: Option<String>,
}

impl CheckActivity {
    pub fn kind_label(&self) -> &str {
        match self.check_type.as_str() {
            "http" => "HTTP",
            "tcp" => "TCP",
            "dns" => "DNS",
            "icmp" => "Ping",
            "wan" => "Internet",
            "host" => "Host",
            "disk" => "Disk",
            "docker" => "Docker",
            "database" => "Database",
            other => other,
        }
    }

    pub fn result_label(&self) -> String {
        match (self.status, &self.message, self.latency_ms) {
            (CheckStatus::Up, _, Some(latency)) | (_, None, Some(latency)) => {
                format!("{latency:.0} ms")
            }
            (_, Some(message), _) => message.clone(),
            (_, None, None) => String::new(),
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TargetPolicy {
    pub allowed_cidrs: Vec<String>,
    pub allowed_hostnames: Vec<String>,
    pub allowed_protocols: Vec<String>,
    pub allowed_ports: Vec<u16>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Pass,
    Warn,
    Fail,
}

impl Outcome {
    pub fn tone(self) -> Tone {
        match self {
            Self::Pass => Tone::Success,
            Self::Warn => Tone::Warning,
            Self::Fail => Tone::Danger,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorCheck {
    pub label: String,
    pub outcome: Outcome,
    pub detail: String,
    pub hint: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReport {
    pub checks: Vec<DoctorCheck>,
}

impl DoctorReport {
    pub fn count(&self, outcome: Outcome) -> usize {
        self.checks
            .iter()
            .filter(|check| check.outcome == outcome)
            .count()
    }

    pub fn text(&self) -> String {
        self.checks
            .iter()
            .map(|check| {
                let mark = match check.outcome {
                    Outcome::Pass => "OK  ",
                    Outcome::Warn => "WARN",
                    Outcome::Fail => "FAIL",
                };
                let hint = check
                    .hint
                    .as_ref()
                    .map(|hint| format!("\n      {hint}"))
                    .unwrap_or_default();
                format!("{mark}  {}: {}{hint}", check.label, check.detail)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

pub fn format_age(seconds: u64) -> String {
    let (value, unit) = match seconds {
        0..5 => return "just now".to_owned(),
        5..60 => (seconds, "second"),
        60..3_600 => (seconds / 60, "minute"),
        3_600..86_400 => (seconds / 3_600, "hour"),
        _ => (seconds / 86_400, "day"),
    };
    format!("{} ago", count_label(value as usize, unit))
}

pub fn count_label(count: usize, singular: &str) -> String {
    format!("{count} {singular}{}", if count == 1 { "" } else { "s" })
}

#[cfg(test)]
#[path = "model_tests.rs"]
mod tests;
