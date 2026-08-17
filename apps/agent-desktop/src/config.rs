use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use directories::ProjectDirs;
use ipnet::IpNet;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::target_policy::TargetPolicy;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub server_url: String,
    pub agent_key: String,
    pub target_policy: TargetPolicy,
}

impl AgentConfig {
    pub fn new(server: &str, key: &str, allow_insecure_http: bool) -> Result<Self> {
        let server_url = normalize_server_url(server, allow_insecure_http)?;
        if !key.starts_with("mim_agent_") || key.len() < 40 {
            bail!("agent key is invalid");
        }
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
        config.target_policy.allowed_cidrs = allowed_cidrs
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| {
                value
                    .parse::<IpNet>()
                    .with_context(|| format!("allowed CIDR is invalid: {value}"))
            })
            .collect::<Result<Vec<_>>>()?;
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
        config.target_policy.validate()?;
        Ok(config)
    }

    pub fn save(&self) -> Result<PathBuf> {
        let path = config_path()?;
        self.save_to(&path)?;
        Ok(path)
    }

    fn save_to(&self, path: &Path) -> Result<()> {
        let directory = path.parent().context("configuration path has no parent")?;
        fs::create_dir_all(directory)?;
        fs::write(path, serde_json::to_vec_pretty(self)?)?;
        restrict_permissions(path)?;
        Ok(())
    }

    pub fn public_summary(&self) -> String {
        format!("server: {}\ncredential: enrolled", self.server_url)
    }
}

pub fn config_path() -> Result<PathBuf> {
    let directories = project_directories()?;
    Ok(directories.config_dir().join("agent-desktop.json"))
}

pub fn collection_path() -> Result<PathBuf> {
    let directories = project_directories()?;
    Ok(directories.data_local_dir().join("collected-snapshots"))
}

fn project_directories() -> Result<ProjectDirs> {
    ProjectDirs::from("app", "mimorii", "agent-desktop")
        .context("could not determine the user configuration directory")
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
    url.set_query(None);
    url.set_fragment(None);
    let path = url.path().trim_end_matches('/');
    if !path.ends_with("/api") {
        url.set_path(&format!("{path}/api"));
    }
    Ok(url.to_string().trim_end_matches('/').to_owned())
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
