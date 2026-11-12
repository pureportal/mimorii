use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

use crate::models::{AgentTask, CheckState, CheckType, TaskResult};
use crate::runtime_state::{format_age, unix_now};
use crate::terminal::{self, Tone};

pub(crate) const RECENT_CHECK_LIMIT: usize = 50;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckActivity {
    pub checked_at: u64,
    pub check_type: CheckType,
    pub target: String,
    pub status: CheckState,
    pub latency_ms: Option<f64>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckActivityView {
    pub checked_seconds_ago: u64,
    pub check_type: CheckType,
    pub target: String,
    pub status: CheckState,
    pub latency_ms: Option<f64>,
    pub message: Option<String>,
}

impl CheckActivity {
    pub(crate) fn view(&self, now: u64) -> CheckActivityView {
        CheckActivityView {
            checked_seconds_ago: now.saturating_sub(self.checked_at),
            check_type: self.check_type,
            target: self.target.clone(),
            status: self.status,
            latency_ms: self.latency_ms,
            message: self.message.clone(),
        }
    }
}

pub(crate) fn record(tasks: &[AgentTask], results: &[TaskResult]) -> Vec<CheckActivity> {
    let checked_at = unix_now();
    tasks
        .iter()
        .zip(results)
        .map(|(task, result)| CheckActivity {
            checked_at,
            check_type: task.check_type,
            target: describe_target(task.check_type, &task.config),
            status: result.status,
            latency_ms: result.latency_ms,
            message: result
                .message
                .as_ref()
                .map(|message| message.chars().take(300).collect()),
        })
        .collect()
}

pub(crate) fn describe_target(check_type: CheckType, config: &Value) -> String {
    let text = |pointer: &str| {
        config
            .pointer(pointer)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
    };
    let port = |pointer: &str| config.pointer(pointer).and_then(Value::as_u64);
    let described = match check_type {
        CheckType::Http => text("/target/url").map(display_url),
        CheckType::Tcp => {
            text("/target/host").map(|host| host_with_port(host, port("/target/port")))
        }
        CheckType::Dns => text("/target/hostname").map(|hostname| {
            text("/recordType").map_or_else(
                || hostname.to_owned(),
                |record| format!("{hostname} {}", record.to_uppercase()),
            )
        }),
        CheckType::Icmp => text("/target/host").map(str::to_owned),
        CheckType::Wan => config
            .pointer("/targets")
            .and_then(Value::as_array)
            .map(|targets| {
                targets
                    .iter()
                    .filter_map(|target| target.get("name").and_then(Value::as_str))
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .filter(|names| !names.is_empty()),
        CheckType::Database => text("/target/host").map(|host| {
            let address = host_with_port(host, port("/target/port"));
            text("/target/engine").map_or(address.clone(), |engine| format!("{engine} {address}"))
        }),
        CheckType::Host => Some("This computer".to_owned()),
        CheckType::Disk => text("/mount").map(str::to_owned),
        CheckType::Docker => {
            Some(text("/containerNamePattern").map_or("All containers".to_owned(), str::to_owned))
        }
    };
    described.unwrap_or_else(|| check_type_label(check_type).to_owned())
}

fn display_url(value: &str) -> String {
    let Ok(url) = Url::parse(value) else {
        return "HTTP endpoint".to_owned();
    };
    let host = url.host_str().unwrap_or_default();
    let port = url
        .port()
        .map(|port| format!(":{port}"))
        .unwrap_or_default();
    let path = if url.path() == "/" { "" } else { url.path() };
    format!("{}://{host}{port}{path}", url.scheme())
}

fn host_with_port(host: &str, port: Option<u64>) -> String {
    match port {
        Some(port) if host.contains(':') => format!("[{host}]:{port}"),
        Some(port) => format!("{host}:{port}"),
        None => host.to_owned(),
    }
}

pub(crate) fn check_type_label(check_type: CheckType) -> &'static str {
    match check_type {
        CheckType::Http => "HTTP",
        CheckType::Tcp => "TCP",
        CheckType::Dns => "DNS",
        CheckType::Icmp => "Ping",
        CheckType::Wan => "Internet",
        CheckType::Host => "Host",
        CheckType::Disk => "Disk",
        CheckType::Docker => "Docker",
        CheckType::Database => "Database",
    }
}

fn status_tone(status: CheckState) -> (Tone, &'static str) {
    match status {
        CheckState::Up => (Tone::Success, "Up"),
        CheckState::Degraded => (Tone::Warning, "Degraded"),
        CheckState::Down => (Tone::Danger, "Down"),
    }
}

pub(crate) fn render(checks: &[CheckActivityView]) -> String {
    if checks.is_empty() {
        return format!(
            "{}\n\n  {}",
            terminal::title("Recent checks", ""),
            terminal::paint(terminal::MUTED, "No checks have run on this computer yet.")
        );
    }
    let age_width = checks
        .iter()
        .map(|check| format_age(check.checked_seconds_ago).chars().count())
        .max()
        .unwrap_or(0);
    let target_width = checks
        .iter()
        .map(|check| check.target.chars().count().min(48))
        .max()
        .unwrap_or(0);
    let rows = checks
        .iter()
        .map(|check| {
            let (tone, label) = status_tone(check.status);
            let target: String = check.target.chars().take(48).collect();
            let detail = match (check.status, &check.message, check.latency_ms) {
                (CheckState::Up, _, Some(latency)) => format!("{latency:.0} ms"),
                (_, Some(message), _) => message.clone(),
                (_, None, Some(latency)) => format!("{latency:.0} ms"),
                (_, None, None) => String::new(),
            };
            let age = terminal::paint(
                terminal::MUTED,
                format!("{:<age_width$}", format_age(check.checked_seconds_ago)),
            );
            let kind = check_type_label(check.check_type);
            format!(
                "  {age}  {} {}  {kind:<8}  {target:<target_width$}  {}",
                terminal::mark(tone),
                terminal::tinted(tone, format!("{label:<8}")),
                terminal::paint(terminal::MUTED, detail),
            )
            .trim_end()
            .to_owned()
        })
        .collect::<Vec<_>>();
    format!(
        "{}\n\n{}",
        terminal::title(
            "Recent checks",
            &terminal::count(checks.len(), "check", "checks")
        ),
        rows.join("\n")
    )
}

#[derive(Serialize)]
struct ActivityOutput<'a> {
    checks: &'a [CheckActivityView],
}

pub(crate) fn show(json: bool, limit: usize) -> Result<()> {
    let now = unix_now();
    let checks = crate::runtime_state::RuntimeState::load(&crate::config::state_path()?)?
        .map(|state| {
            state
                .recent_checks
                .iter()
                .take(limit)
                .map(|check| check.view(now))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if json {
        println!(
            "{}",
            serde_json::to_string(&ActivityOutput { checks: &checks })?
        );
    } else {
        anstream::println!("{}", render(&checks));
    }
    Ok(())
}

#[cfg(test)]
#[path = "activity_tests.rs"]
mod tests;
