use std::time::Instant;

use anyhow::{Result, bail};
use serde::Serialize;

use crate::api::{ApiClient, KeyRejected};
use crate::config::{self, AgentConfig};
use crate::runtime_state::{RuntimeSummary, format_age};
use crate::service_state::ServiceState;
use crate::status_command::runtime_summary;
use crate::terminal::{self, Tone};

const STALE_CONTACT_SECONDS: u64 = 120;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Outcome {
    Pass,
    Warn,
    Fail,
}

impl Outcome {
    fn tone(self) -> Tone {
        match self {
            Self::Pass => Tone::Success,
            Self::Warn => Tone::Warning,
            Self::Fail => Tone::Danger,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DoctorCheck {
    pub(crate) id: &'static str,
    pub(crate) label: &'static str,
    pub(crate) outcome: Outcome,
    pub(crate) detail: String,
    pub(crate) hint: Option<String>,
}

impl DoctorCheck {
    fn new(
        id: &'static str,
        label: &'static str,
        outcome: Outcome,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            id,
            label,
            outcome,
            detail: detail.into(),
            hint: None,
        }
    }

    fn hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DoctorReport {
    pub(crate) healthy: bool,
    pub(crate) checks: Vec<DoctorCheck>,
}

pub(crate) fn run(json: bool) -> Result<()> {
    let report = diagnose()?;
    if json {
        println!("{}", serde_json::to_string(&report)?);
    } else {
        anstream::println!("{}", render(&report));
    }
    let failures = report
        .checks
        .iter()
        .filter(|check| check.outcome == Outcome::Fail)
        .count();
    if failures > 0 {
        bail!(
            "diagnostics found {}",
            terminal::count(failures, "problem", "problems")
        );
    }
    Ok(())
}

fn diagnose() -> Result<DoctorReport> {
    let mut checks = Vec::new();
    let configured = configuration_check(&mut checks)?;
    if let Some(config) = configured {
        checks.push(transport_check(&config.server_url));
        checks.push(server_check(config));
    }
    let service = crate::service::state()?;
    checks.push(service_check(service));
    let runtime = runtime_summary().ok().flatten();
    checks.extend(runtime_checks(runtime.as_ref(), service));
    Ok(DoctorReport {
        healthy: checks.iter().all(|check| check.outcome != Outcome::Fail),
        checks,
    })
}

fn configuration_check(checks: &mut Vec<DoctorCheck>) -> Result<Option<AgentConfig>> {
    let path = config::config_path()?;
    if !path.exists() {
        checks.push(
            DoctorCheck::new("configuration", "Enrollment", Outcome::Fail, "Not enrolled").hint(
                "Run `mimorii-agent-desktop enroll --server <url> --key <key>` with a key from Mimorii.",
            ),
        );
        return Ok(None);
    }
    match AgentConfig::load() {
        Ok(config) => {
            checks.push(DoctorCheck::new(
                "configuration",
                "Enrollment",
                Outcome::Pass,
                format!("Enrolled with {}", config.server_url),
            ));
            Ok(Some(config))
        }
        Err(error) => {
            checks.push(
                DoctorCheck::new(
                    "configuration",
                    "Enrollment",
                    Outcome::Fail,
                    format!("{error:#}"),
                )
                .hint("Enroll again to replace the invalid configuration."),
            );
            Ok(None)
        }
    }
}

pub(crate) fn transport_check(server_url: &str) -> DoctorCheck {
    if server_url.starts_with("https://") {
        DoctorCheck::new("transport", "Encryption", Outcome::Pass, "HTTPS")
    } else {
        DoctorCheck::new("transport", "Encryption", Outcome::Warn, "Unencrypted HTTP")
            .hint("Use an HTTPS server URL outside trusted local networks.")
    }
}

fn server_check(config: AgentConfig) -> DoctorCheck {
    let started = Instant::now();
    let result = ApiClient::new(config).and_then(|client| client.verify());
    server_outcome(result.map(|()| started.elapsed().as_millis()))
}

pub(crate) fn server_outcome(result: Result<u128>) -> DoctorCheck {
    match result {
        Ok(milliseconds) => DoctorCheck::new(
            "server",
            "Server",
            Outcome::Pass,
            format!("Reachable in {milliseconds} ms"),
        ),
        Err(error) if error.downcast_ref::<KeyRejected>().is_some() => DoctorCheck::new(
            "server",
            "Server",
            Outcome::Fail,
            "The agent key was rejected",
        )
        .hint("Create a new enrollment key in Mimorii and enroll again."),
        Err(error) => DoctorCheck::new("server", "Server", Outcome::Fail, format!("{error:#}"))
            .hint("Check the server URL, DNS, proxy, and firewall."),
    }
}

pub(crate) fn service_check(state: ServiceState) -> DoctorCheck {
    let check = DoctorCheck::new(
        "service",
        "Service",
        match state {
            ServiceState::Running => Outcome::Pass,
            ServiceState::Starting | ServiceState::Stopping => Outcome::Warn,
            _ => Outcome::Fail,
        },
        state.label(),
    );
    match state {
        ServiceState::Running | ServiceState::Starting | ServiceState::Stopping => check,
        ServiceState::NotInstalled => check.hint(service_install_hint()),
        ServiceState::Paused | ServiceState::Stopped | ServiceState::Failed => {
            check.hint(service_start_hint())
        }
    }
}

fn service_install_hint() -> &'static str {
    if cfg!(windows) {
        "Reinstall Mimorii Agent to register the Windows service."
    } else {
        "Run `mimorii-agent-desktop service install`."
    }
}

fn service_start_hint() -> &'static str {
    if cfg!(windows) {
        "Start the service from the Mimorii Agent app."
    } else {
        "Run `systemctl --user start mimorii-agent-desktop`."
    }
}

pub(crate) fn runtime_checks(
    runtime: Option<&RuntimeSummary>,
    service: ServiceState,
) -> Vec<DoctorCheck> {
    let Some(runtime) = runtime else {
        let check = DoctorCheck::new(
            "activity",
            "Activity",
            Outcome::Warn,
            "No report from the service yet",
        );
        return vec![if service == ServiceState::Running {
            check.hint("The service reports within 30 seconds of starting.")
        } else {
            check.hint("Start the service and wait for its first contact.")
        }];
    };
    let activity = match runtime.last_contact_seconds_ago {
        Some(seconds) if seconds <= STALE_CONTACT_SECONDS => DoctorCheck::new(
            "activity",
            "Activity",
            Outcome::Pass,
            format!("Last contact {}", format_age(seconds)),
        ),
        Some(seconds) => DoctorCheck::new(
            "activity",
            "Activity",
            Outcome::Warn,
            format!("Last contact {}", format_age(seconds)),
        )
        .hint("The agent contacts Mimorii every 30 seconds while the service runs."),
        None => DoctorCheck::new(
            "activity",
            "Activity",
            Outcome::Warn,
            "No contact with the server yet",
        ),
    };
    let queue = if runtime.pending_snapshots == 0 {
        DoctorCheck::new("queue", "Upload queue", Outcome::Pass, "Empty")
    } else {
        DoctorCheck::new(
            "queue",
            "Upload queue",
            Outcome::Warn,
            terminal::count(
                runtime.pending_snapshots,
                "snapshot waiting",
                "snapshots waiting",
            ),
        )
        .hint("Queued snapshots upload automatically after the server is reachable again.")
    };
    let errors = match &runtime.last_error {
        Some(error) => DoctorCheck::new(
            "errors",
            "Last error",
            Outcome::Fail,
            match runtime.last_error_seconds_ago {
                Some(seconds) => format!("{error} ({})", format_age(seconds)),
                None => error.clone(),
            },
        ),
        None => DoctorCheck::new("errors", "Last error", Outcome::Pass, "None"),
    };
    vec![activity, queue, errors]
}

pub(crate) fn render(report: &DoctorReport) -> String {
    let width = report
        .checks
        .iter()
        .map(|check| check.label.chars().count())
        .max()
        .unwrap_or(0);
    let rows = report
        .checks
        .iter()
        .map(|check| {
            let mut line = format!(
                "  {} {}  {}",
                terminal::mark(check.outcome.tone()),
                terminal::paint(terminal::STRONG, format!("{:<width$}", check.label)),
                check.detail
            );
            if let Some(hint) = &check.hint {
                line.push_str(&format!(
                    "\n  {}  {}",
                    " ".repeat(width + 2),
                    terminal::paint(terminal::MUTED, hint)
                ));
            }
            line
        })
        .collect::<Vec<_>>()
        .join("\n");
    let problems = report
        .checks
        .iter()
        .filter(|check| check.outcome == Outcome::Fail)
        .count();
    let warnings = report
        .checks
        .iter()
        .filter(|check| check.outcome == Outcome::Warn)
        .count();
    let summary = match (problems, warnings) {
        (0, 0) => terminal::success("Everything looks good"),
        (0, warnings) => format!(
            "{} {}",
            terminal::mark(Tone::Warning),
            terminal::count(warnings, "warning", "warnings")
        ),
        (problems, _) => format!(
            "{} {}",
            terminal::mark(Tone::Danger),
            terminal::count(problems, "problem found", "problems found")
        ),
    };
    format!(
        "{}\n\n{rows}\n\n  {summary}",
        terminal::title("Mimorii Agent diagnostics", "")
    )
}

#[cfg(test)]
#[path = "doctor_tests.rs"]
mod tests;
