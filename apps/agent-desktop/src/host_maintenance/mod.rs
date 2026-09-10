mod command;
mod evaluation;
#[cfg(any(target_os = "linux", test))]
mod linux;
#[cfg(any(windows, test))]
mod windows;

use std::time::{Duration, Instant};

use anyhow::{Result, bail};
use serde::Deserialize;

pub(crate) use evaluation::Report;

#[derive(Clone, Debug, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Config {
    pub security_updates: bool,
    pub software_updates: bool,
    pub reboot_required: bool,
    pub security: bool,
    pub failed_services: bool,
    pub security_update_critical_count: u64,
    pub software_update_warning_count: u64,
    pub failed_service_warning_count: u64,
    pub max_update_age_hours: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            security_updates: true,
            software_updates: true,
            reboot_required: true,
            security: true,
            failed_services: true,
            security_update_critical_count: 1,
            software_update_warning_count: 1,
            failed_service_warning_count: 1,
            max_update_age_hours: 72,
        }
    }
}

impl Config {
    pub fn validate(&self) -> Result<()> {
        if [
            self.security_update_critical_count,
            self.software_update_warning_count,
            self.failed_service_warning_count,
        ]
        .iter()
        .any(|count| !(1..=100_000).contains(count))
            || !(1..=8_760).contains(&self.max_update_age_hours)
        {
            bail!("host configuration is invalid");
        }
        Ok(())
    }

    fn enabled(&self) -> bool {
        self.security_updates
            || self.software_updates
            || self.reboot_required
            || self.security
            || self.failed_services
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(super) enum Observation<T> {
    Available { data: T },
    Unavailable { reason: String },
}

impl<T> Observation<T> {
    fn unavailable(reason: impl Into<String>) -> Self {
        Self::Unavailable {
            reason: reason.into(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Updates {
    count: u64,
    security_count: Option<u64>,
    examples: Vec<String>,
    security_examples: Vec<String>,
    data_age_hours: Option<f64>,
    unavailable: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct Issues {
    count: u64,
    examples: Vec<String>,
    unavailable: Vec<String>,
}

pub(super) struct Observations {
    updates: Observation<Updates>,
    reboot: Observation<Issues>,
    security: Observation<Issues>,
    services: Observation<Issues>,
}

impl Observations {
    fn unavailable(reason: &str) -> Self {
        Self {
            updates: Observation::unavailable(reason),
            reboot: Observation::unavailable(reason),
            security: Observation::unavailable(reason),
            services: Observation::unavailable(reason),
        }
    }
}

pub(crate) fn assess(config: &Config, timeout_ms: u64) -> Report {
    if !config.enabled() {
        return Report::default();
    }
    let deadline = Instant::now() + Duration::from_millis(timeout_ms.min(60_000));
    #[cfg(windows)]
    let observations = windows::collect(config, deadline);
    #[cfg(target_os = "linux")]
    let observations = linux::collect(config, deadline);
    #[cfg(not(any(windows, target_os = "linux")))]
    let observations = {
        let _ = deadline;
        Observations::unavailable("Host maintenance assessment is not supported on this platform")
    };
    evaluation::evaluate(config, observations)
}

#[cfg(test)]
mod tests;
