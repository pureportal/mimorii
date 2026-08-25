use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::{Context, Result, bail};
#[cfg(not(windows))]
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::target_policy::TargetPolicy;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub server_url: String,
    pub agent_key: String,
    pub target_policy: TargetPolicy,
}

impl AgentConfig {
    pub fn new(server: &str, key: &str, allow_insecure_http: bool) -> Result<Self> {
        let server_url = normalize_server_url(server, allow_insecure_http)?;
        validate_agent_key(key)?;
        Ok(Self {
            server_url,
            agent_key: key.to_owned(),
            target_policy: TargetPolicy::default(),
        })
    }

    pub fn new_check_runner(
        server: &str,
        key: &str,
        allow_insecure_http: bool,
        allowed_cidrs: &str,
    ) -> Result<Self> {
        let mut config = Self::new(server, key, allow_insecure_http)?;
        config.target_policy.set_allowed_cidrs(allowed_cidrs)?;
        Ok(config)
    }

    pub fn load() -> Result<Self> {
        let path = config_path()?;
        Self::load_from(&path)
    }

    pub(crate) fn load_from(path: &Path) -> Result<Self> {
        let value = fs::read_to_string(path).with_context(|| {
            format!(
                "agent is not enrolled; configuration missing at {}",
                path.display()
            )
        })?;
        let config: Self =
            serde_json::from_str(&value).context("agent configuration is invalid")?;
        config.validate()?;
        Ok(config)
    }

    pub fn save(&self) -> Result<PathBuf> {
        let path = config_path()?;
        self.save_to(&path)?;
        Ok(path)
    }

    fn save_to(&self, path: &Path) -> Result<()> {
        self.validate()?;
        let directory = path.parent().context("configuration path has no parent")?;
        fs::create_dir_all(directory)?;
        let (mut file, temporary_path) = open_temporary_config(directory)?;
        let result = (|| {
            file.write_all(&serde_json::to_vec_pretty(self)?)?;
            file.write_all(b"\n")?;
            file.sync_all()?;
            restrict_permissions(&temporary_path)?;
            atomic_replace(&temporary_path, path)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary_path);
        }
        result
    }

    pub fn public_summary(&self) -> String {
        format!("server: {}\ncredential: enrolled", self.server_url)
    }

    fn validate(&self) -> Result<()> {
        if normalize_server_url(&self.server_url, true)? != self.server_url {
            bail!("agent server URL is not normalized");
        }
        validate_agent_key(&self.agent_key)?;
        self.target_policy.validate()
    }
}

pub fn config_path() -> Result<PathBuf> {
    #[cfg(windows)]
    return Ok(windows_data_directory()?.join("agent-desktop.json"));

    #[cfg(not(windows))]
    let directories = project_directories()?;
    #[cfg(not(windows))]
    return Ok(directories.config_dir().join("agent-desktop.json"));
}

pub fn collection_path() -> Result<PathBuf> {
    #[cfg(windows)]
    return Ok(windows_data_directory()?.join("collected-snapshots"));

    #[cfg(not(windows))]
    let directories = project_directories()?;
    #[cfg(not(windows))]
    return Ok(directories.data_local_dir().join("collected-snapshots"));
}

#[cfg(not(windows))]
fn project_directories() -> Result<ProjectDirs> {
    ProjectDirs::from("app", "mimorii", "agent-desktop")
        .context("could not determine the user configuration directory")
}

#[cfg(windows)]
pub fn log_path() -> Result<PathBuf> {
    Ok(windows_data_directory()?.join("agent-desktop.log"))
}

#[cfg(windows)]
fn windows_data_directory() -> Result<PathBuf> {
    let program_data = std::env::var_os("ProgramData")
        .filter(|value| !value.is_empty())
        .context("ProgramData is unavailable")?;
    Ok(PathBuf::from(program_data).join("Mimorii").join("Agent"))
}

static CONFIG_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn open_temporary_config(directory: &Path) -> Result<(fs::File, PathBuf)> {
    for _ in 0..16 {
        let sequence = CONFIG_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = directory.join(format!(
            ".agent-desktop.{}.{}.tmp",
            std::process::id(),
            sequence
        ));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        configure_file_creation(&mut options);
        match options.open(&path) {
            Ok(file) => return Ok((file, path)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => {
                return Err(error).with_context(|| {
                    format!(
                        "could not create staged configuration at {}",
                        path.display()
                    )
                });
            }
        }
    }
    bail!(
        "could not allocate a staged configuration file in {}",
        directory.display()
    )
}

#[cfg(unix)]
fn configure_file_creation(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;
    options.mode(0o600);
}

#[cfg(not(unix))]
fn configure_file_creation(_options: &mut OpenOptions) {}

#[cfg(windows)]
fn atomic_replace(source: &Path, destination: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination_wide = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let replaced = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if replaced == 0 {
        return Err(std::io::Error::last_os_error()).with_context(|| {
            format!(
                "could not commit configuration to {}",
                destination.display()
            )
        });
    }
    Ok(())
}

#[cfg(not(windows))]
fn atomic_replace(source: &Path, destination: &Path) -> Result<()> {
    fs::rename(source, destination).with_context(|| {
        format!(
            "could not commit configuration to {}",
            destination.display()
        )
    })
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) enum ConfigRefresh {
    Applied,
    Rejected(String),
    Unchanged,
}

pub(crate) struct ConfigWatcher {
    path: PathBuf,
    active: Option<AgentConfig>,
    rejected_error: Option<String>,
}

impl ConfigWatcher {
    pub(crate) fn new(path: PathBuf) -> Self {
        Self {
            path,
            active: None,
            rejected_error: None,
        }
    }

    pub(crate) fn refresh(&mut self) -> ConfigRefresh {
        match AgentConfig::load_from(&self.path) {
            Ok(config) => {
                self.rejected_error = None;
                if self.active.as_ref() == Some(&config) {
                    ConfigRefresh::Unchanged
                } else {
                    self.active = Some(config);
                    ConfigRefresh::Applied
                }
            }
            Err(error) => {
                let error = format!("{error:#}");
                if self.rejected_error.as_ref() == Some(&error) {
                    ConfigRefresh::Unchanged
                } else {
                    self.rejected_error = Some(error.clone());
                    ConfigRefresh::Rejected(error)
                }
            }
        }
    }

    pub(crate) fn active(&self) -> Option<&AgentConfig> {
        self.active.as_ref()
    }
}

fn normalize_server_url(value: &str, allow_insecure_http: bool) -> Result<String> {
    let mut url = Url::parse(value.trim()).context("server URL is invalid")?;
    if url.scheme() != "http" && url.scheme() != "https" {
        bail!("server URL must use HTTP or HTTPS");
    }
    if url.scheme() == "http" && !allow_insecure_http {
        let host = url.host_str().unwrap_or_default();
        if host != "localhost" && host != "127.0.0.1" && host != "::1" && host != "[::1]" {
            bail!("HTTP exposes the agent key; use HTTPS or pass --allow-insecure-http");
        }
    }
    if url.host_str().is_none() {
        bail!("server URL must include a host");
    }
    if !url.username().is_empty() || url.password().is_some() {
        bail!("server URL must not contain credentials");
    }
    url.set_query(None);
    url.set_fragment(None);
    let path = url.path().trim_end_matches('/');
    if !path.ends_with("/api") {
        url.set_path(&format!("{path}/api"));
    }
    Ok(url.to_string().trim_end_matches('/').to_owned())
}

fn validate_agent_key(key: &str) -> Result<()> {
    if !key.starts_with("mim_agent_") || key.len() < 40 {
        bail!("agent key is invalid");
    }
    Ok(())
}

#[cfg(unix)]
fn restrict_permissions(path: &std::path::Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &std::path::Path) -> Result<()> {
    Ok(())
}

#[cfg(test)]
#[path = "config_tests.rs"]
mod tests;
