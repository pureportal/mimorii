use serde::Serialize;

use crate::terminal::Tone;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ServiceState {
    Running,
    Starting,
    Stopping,
    Paused,
    Stopped,
    #[cfg_attr(windows, allow(dead_code))]
    Failed,
    NotInstalled,
}

impl ServiceState {
    pub(crate) fn label(self) -> &'static str {
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

    pub(crate) fn tone(self) -> Tone {
        match self {
            Self::Running => Tone::Success,
            Self::Starting | Self::Stopping | Self::Paused => Tone::Warning,
            Self::Stopped | Self::Failed | Self::NotInstalled => Tone::Danger,
        }
    }

    #[cfg(any(target_os = "linux", test))]
    pub(crate) fn from_systemd(active_state: &str) -> Self {
        match active_state {
            "active" | "reloading" => Self::Running,
            "activating" => Self::Starting,
            "deactivating" => Self::Stopping,
            "failed" => Self::Failed,
            _ => Self::Stopped,
        }
    }
}

#[cfg(test)]
#[path = "service_state_tests.rs"]
mod tests;
