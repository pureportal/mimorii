use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::runtime::RuntimeReporter;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeState {
    pub agent_version: String,
    pub started_at: u64,
    pub updated_at: u64,
    pub last_contact_at: Option<u64>,
    pub last_upload_at: Option<u64>,
    pub last_error: Option<String>,
    pub last_error_at: Option<u64>,
    pub pending_snapshots: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSummary {
    pub updated_seconds_ago: u64,
    pub last_contact_seconds_ago: Option<u64>,
    pub last_upload_seconds_ago: Option<u64>,
    pub last_error: Option<String>,
    pub last_error_seconds_ago: Option<u64>,
    pub pending_snapshots: usize,
}

impl RuntimeState {
    pub fn load(path: &Path) -> Result<Option<Self>> {
        match fs::read(path) {
            Ok(value) => serde_json::from_slice(&value)
                .map(Some)
                .with_context(|| format!("agent runtime state at {} is invalid", path.display())),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error).with_context(|| {
                format!("could not read agent runtime state at {}", path.display())
            }),
        }
    }

    pub fn summary(&self, now: u64) -> RuntimeSummary {
        let age = |at: u64| now.saturating_sub(at);
        RuntimeSummary {
            updated_seconds_ago: age(self.updated_at),
            last_contact_seconds_ago: self.last_contact_at.map(age),
            last_upload_seconds_ago: self.last_upload_at.map(age),
            last_error: self.last_error.clone(),
            last_error_seconds_ago: self.last_error_at.map(age),
            pending_snapshots: self.pending_snapshots,
        }
    }

    fn save(&self, path: &Path) -> Result<()> {
        let directory = path.parent().context("runtime state path has no parent")?;
        fs::create_dir_all(directory)?;
        let mut staged = tempfile::Builder::new()
            .prefix(".agent-state-")
            .tempfile_in(directory)?;
        staged.write_all(&serde_json::to_vec(self)?)?;
        staged.as_file().sync_all()?;
        staged.persist(path).map_err(|error| error.error)?;
        Ok(())
    }
}

impl RuntimeSummary {
    pub fn lines(&self) -> Vec<String> {
        let mut lines = vec![
            format!(
                "last contact: {}",
                self.last_contact_seconds_ago
                    .map_or("never".to_owned(), format_age)
            ),
            format!(
                "last upload: {}",
                self.last_upload_seconds_ago
                    .map_or("never".to_owned(), format_age)
            ),
            format!("pending snapshots: {}", self.pending_snapshots),
        ];
        if let Some(error) = &self.last_error {
            let age = self
                .last_error_seconds_ago
                .map(|seconds| format!(" ({})", format_age(seconds)))
                .unwrap_or_default();
            lines.push(format!("last error: {error}{age}"));
        }
        lines
    }
}

pub struct RuntimeStatus<'a> {
    path: PathBuf,
    state: RuntimeState,
    reporter: &'a dyn RuntimeReporter,
    save_failed: bool,
}

impl<'a> RuntimeStatus<'a> {
    pub fn new(path: PathBuf, reporter: &'a dyn RuntimeReporter) -> Self {
        let now = unix_now();
        let previous = match RuntimeState::load(&path) {
            Ok(previous) => previous.unwrap_or_default(),
            Err(error) => {
                reporter.error(&format!("previous agent status was discarded: {error:#}"));
                RuntimeState::default()
            }
        };
        let mut status = Self {
            path,
            state: RuntimeState {
                agent_version: env!("CARGO_PKG_VERSION").to_owned(),
                started_at: now,
                updated_at: now,
                last_contact_at: previous.last_contact_at,
                last_upload_at: previous.last_upload_at,
                ..RuntimeState::default()
            },
            reporter,
            save_failed: false,
        };
        status.persist();
        status
    }

    pub fn contacted(&mut self) {
        self.state.last_contact_at = Some(unix_now());
    }

    pub fn uploaded(&mut self) {
        self.state.last_upload_at = Some(unix_now());
    }

    pub fn succeeded(&mut self) {
        self.state.last_error = None;
        self.state.last_error_at = None;
    }

    pub fn failed(&mut self, message: &str) {
        self.reporter.error(message);
        self.state.last_error = Some(message.chars().take(500).collect());
        self.state.last_error_at = Some(unix_now());
    }

    pub fn set_pending_snapshots(&mut self, count: usize) {
        self.state.pending_snapshots = count;
    }

    pub fn persist(&mut self) {
        self.state.updated_at = unix_now();
        match self.state.save(&self.path) {
            Ok(()) => self.save_failed = false,
            Err(error) if !self.save_failed => {
                self.save_failed = true;
                self.reporter.error(&format!(
                    "could not record agent status at {}: {error:#}",
                    self.path.display()
                ));
            }
            Err(_) => {}
        }
    }
}

pub fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}

pub fn format_age(seconds: u64) -> String {
    let (value, unit) = match seconds {
        0..5 => return "just now".to_owned(),
        5..60 => (seconds, "second"),
        60..3_600 => (seconds / 60, "minute"),
        3_600..86_400 => (seconds / 3_600, "hour"),
        _ => (seconds / 86_400, "day"),
    };
    format!("{value} {unit}{} ago", if value == 1 { "" } else { "s" })
}

#[cfg(test)]
#[path = "runtime_state_tests.rs"]
mod tests;
