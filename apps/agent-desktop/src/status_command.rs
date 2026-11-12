use std::io::IsTerminal;
use std::time::Duration;

use anyhow::{Result, bail};
use serde::Serialize;

use crate::activity::CheckActivityView;
use crate::config::{self, AgentConfig};
use crate::models::CheckState;
use crate::runtime_state::{RuntimeState, RuntimeSummary, format_age, unix_now};
use crate::service_state::ServiceState;
use crate::target_policy::TargetPolicy;
use crate::terminal::{self, Tone};

const WATCH_INTERVAL: Duration = Duration::from_secs(2);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentControlStatus {
    pub(crate) agent_version: &'static str,
    pub(crate) service: ServiceState,
    pub(crate) enrolled: bool,
    pub(crate) server_url: Option<String>,
    pub(crate) target_policy: Option<TargetPolicy>,
    pub(crate) configuration_error: Option<String>,
    pub(crate) runtime: Option<RuntimeSummary>,
    #[cfg(windows)]
    pub(crate) log_path: String,
}

pub(crate) fn control_status() -> Result<AgentControlStatus> {
    let service = crate::service::state()?;
    let runtime = runtime_summary().ok().flatten();
    let path = config::config_path()?;
    let (enrolled, server_url, target_policy, configuration_error) = if !path.exists() {
        (false, None, None, None)
    } else {
        match AgentConfig::load() {
            Ok(config) => (
                true,
                Some(config.server_url),
                Some(config.target_policy),
                None,
            ),
            Err(error) => (false, None, None, Some(format!("{error:#}"))),
        }
    };
    Ok(AgentControlStatus {
        agent_version: env!("CARGO_PKG_VERSION"),
        service,
        enrolled,
        server_url,
        target_policy,
        configuration_error,
        runtime,
        #[cfg(windows)]
        log_path: config::log_path()?.display().to_string(),
    })
}

pub(crate) fn runtime_summary() -> Result<Option<RuntimeSummary>> {
    Ok(RuntimeState::load(&config::state_path()?)?.map(|state| state.summary(unix_now())))
}

pub(crate) fn show(json: bool, watch: bool) -> Result<()> {
    if !watch {
        let status = control_status()?;
        if json {
            println!("{}", serde_json::to_string(&status)?);
        } else {
            anstream::println!("{}", render(&status));
        }
        return Ok(());
    }
    if json || !std::io::stdout().is_terminal() {
        bail!("--watch needs an interactive terminal; use --json for scripts");
    }
    loop {
        let status = control_status()?;
        anstream::print!(
            "\x1b[2J\x1b[H{}\n\n  {}\n",
            render(&status),
            terminal::paint(
                terminal::MUTED,
                "Refreshing every 2 seconds · Ctrl+C to exit"
            )
        );
        std::thread::sleep(WATCH_INTERVAL);
    }
}

pub(crate) fn render(status: &AgentControlStatus) -> String {
    let mut rows = vec![(
        "Service",
        terminal::badge(status.service.tone(), status.service.label()),
    )];
    match (&status.server_url, &status.configuration_error) {
        (Some(server_url), _) => {
            rows.push(("Server", server_label(server_url)));
            rows.push(("Enrollment", terminal::badge(Tone::Success, "Enrolled")));
        }
        (None, Some(error)) => {
            rows.push(("Configuration", terminal::tinted(Tone::Danger, error)));
        }
        (None, None) => rows.push(("Enrollment", terminal::badge(Tone::Danger, "Not enrolled"))),
    }
    let runtime = status.runtime.as_ref().filter(|_| status.enrolled);
    if let Some(runtime) = runtime {
        rows.push(("Last contact", age_label(runtime.last_contact_seconds_ago)));
        rows.push(("Last upload", age_label(runtime.last_upload_seconds_ago)));
        rows.push(("Upload queue", queue_label(runtime.pending_snapshots)));
        if let Some(summary) = latest_checks_summary(&runtime.recent_checks) {
            rows.push(("Last checks", summary));
        }
    }
    if let Some(policy) = &status.target_policy {
        rows.push(("Network access", policy.summary()));
    }
    #[cfg(windows)]
    rows.push(("Log", status.log_path.clone()));
    #[cfg(target_os = "linux")]
    rows.push(("Log", terminal::command("mimorii-agent-desktop logs")));

    let mut output = format!(
        "{}\n\n{}",
        terminal::title("Mimorii Agent", status.agent_version),
        terminal::fields(&rows)
    );
    if let Some(runtime) = runtime
        && let Some(error) = &runtime.last_error
    {
        let age = runtime
            .last_error_seconds_ago
            .map(format_age)
            .unwrap_or_default();
        output.push_str(&format!(
            "\n\n  {} {} {}\n    {error}",
            terminal::mark(Tone::Danger),
            terminal::paint(terminal::STRONG, "Last error"),
            terminal::paint(terminal::MUTED, age)
        ));
    }
    if !status.enrolled && status.configuration_error.is_none() {
        output.push_str(&format!(
            "\n\n  Enroll this computer with {}",
            terminal::command("mimorii-agent-desktop enroll --server <url> --key <key>")
        ));
    }
    output
}

fn server_label(server_url: &str) -> String {
    if server_url.starts_with("http://") {
        format!(
            "{server_url} {}",
            terminal::tinted(Tone::Warning, "(unencrypted)")
        )
    } else {
        server_url.to_owned()
    }
}

fn age_label(seconds: Option<u64>) -> String {
    seconds.map_or_else(|| terminal::paint(terminal::MUTED, "Never"), format_age)
}

fn queue_label(pending: usize) -> String {
    if pending == 0 {
        "Empty".to_owned()
    } else {
        terminal::tinted(
            Tone::Warning,
            terminal::count(pending, "snapshot waiting", "snapshots waiting"),
        )
    }
}

fn latest_checks_summary(checks: &[CheckActivityView]) -> Option<String> {
    let latest = checks.iter().map(|check| check.checked_seconds_ago).min()?;
    let cycle = checks
        .iter()
        .filter(|check| check.checked_seconds_ago == latest)
        .collect::<Vec<_>>();
    let count = |state: CheckState| cycle.iter().filter(|check| check.status == state).count();
    let parts = [
        (CheckState::Up, Tone::Success, "up"),
        (CheckState::Degraded, Tone::Warning, "degraded"),
        (CheckState::Down, Tone::Danger, "down"),
    ]
    .into_iter()
    .filter_map(|(state, tone, label)| {
        let value = count(state);
        (value > 0).then(|| terminal::tinted(tone, format!("{value} {label}")))
    })
    .collect::<Vec<_>>();
    Some(format!(
        "{} {} · {}",
        terminal::count(cycle.len(), "check", "checks"),
        format_age(latest),
        parts.join(" · ")
    ))
}

#[cfg(test)]
#[path = "status_command_tests.rs"]
mod tests;
