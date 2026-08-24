mod github;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(windows)]
mod windows;

use anyhow::Result;
use semver::Version;
use serde::Serialize;

use github::GitHubReleaseClient;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateStatus {
    current_version: String,
    latest_version: String,
    update_available: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateResult {
    previous_version: String,
    version: String,
    outcome: InstallOutcome,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum InstallOutcome {
    #[cfg(target_os = "linux")]
    Installed,
    #[cfg(windows)]
    InstallerStarted,
}

pub fn run(check_only: bool, json: bool, _privileged: bool) -> Result<()> {
    #[cfg(target_os = "linux")]
    linux::validate_invocation(_privileged)?;
    let current = Version::parse(env!("CARGO_PKG_VERSION"))?;
    let client = GitHubReleaseClient::new()?;
    let release = client.latest()?;
    let status = UpdateStatus {
        current_version: current.to_string(),
        latest_version: release.version.to_string(),
        update_available: release.version > current,
    };

    if check_only || !status.update_available {
        print_status(&status, json)?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    if linux::delegate_if_needed(json, _privileged)? {
        return Ok(());
    }

    let version = release.version.to_string();
    let package = client.download(&release)?;
    #[cfg(target_os = "linux")]
    let outcome = linux::install(package, _privileged)?;
    #[cfg(windows)]
    let outcome = windows::install(package)?;

    let result = UpdateResult {
        previous_version: current.to_string(),
        version,
        outcome,
    };
    if json {
        println!("{}", serde_json::to_string(&result)?);
    } else {
        match outcome {
            #[cfg(target_os = "linux")]
            InstallOutcome::Installed => println!("updated Mimorii Agent to {}", result.version),
            #[cfg(windows)]
            InstallOutcome::InstallerStarted => {
                println!("Mimorii Agent {} installer started", result.version)
            }
        }
    }
    Ok(())
}

fn print_status(status: &UpdateStatus, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string(status)?);
    } else if status.update_available {
        println!(
            "Mimorii Agent {} is available (installed: {})",
            status.latest_version, status.current_version
        );
    } else {
        println!("Mimorii Agent {} is up to date", status.current_version);
    }
    Ok(())
}

#[cfg(windows)]
pub fn apply_windows(package: std::path::PathBuf, sha256: &str, parent_pid: u32) -> Result<()> {
    windows::apply(package, sha256, parent_pid)
}
