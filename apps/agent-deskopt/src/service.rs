use std::path::Path;
use std::process::Command;

use anyhow::{Result, bail};

pub fn install(executable: &Path) -> Result<()> {
    install_platform(executable)
}

pub fn uninstall() -> Result<()> {
    uninstall_platform()
}

#[cfg(target_os = "linux")]
fn install_platform(executable: &Path) -> Result<()> {
    use std::fs;

    let directory = directories::BaseDirs::new()
        .ok_or_else(|| anyhow::anyhow!("could not determine the user home directory"))?
        .config_dir()
        .join("systemd/user");
    fs::create_dir_all(&directory)?;
    let unit = directory.join("mimorii-agent-deskopt.service");
    let content = format!(
        "[Unit]\nDescription=Mimorii desktop monitoring agent\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nExecStart=\"{}\" run\nRestart=on-failure\nRestartSec=10\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=read-only\n\n[Install]\nWantedBy=default.target\n",
        executable.display()
    );
    fs::write(&unit, content)?;
    command("systemctl", &["--user", "daemon-reload"])?;
    command(
        "systemctl",
        &["--user", "enable", "--now", "mimorii-agent-deskopt.service"],
    )?;
    println!("installed {}", unit.display());
    Ok(())
}

#[cfg(target_os = "linux")]
fn uninstall_platform() -> Result<()> {
    let _ = command(
        "systemctl",
        &[
            "--user",
            "disable",
            "--now",
            "mimorii-agent-deskopt.service",
        ],
    );
    let directory = directories::BaseDirs::new()
        .ok_or_else(|| anyhow::anyhow!("could not determine the user home directory"))?
        .config_dir()
        .join("systemd/user");
    let unit = directory.join("mimorii-agent-deskopt.service");
    if unit.exists() {
        std::fs::remove_file(unit)?;
    }
    command("systemctl", &["--user", "daemon-reload"])?;
    Ok(())
}

#[cfg(windows)]
fn install_platform(executable: &Path) -> Result<()> {
    let task = windows_startup_task(executable);
    command(
        "schtasks.exe",
        &[
            "/Create",
            "/F",
            "/SC",
            "ONLOGON",
            "/TN",
            "Mimorii Agent Deskopt",
            "/TR",
            &task,
            "/RL",
            "LIMITED",
        ],
    )?;
    command("schtasks.exe", &["/Run", "/TN", "Mimorii Agent Deskopt"])?;
    println!("installed Mimorii Agent Deskopt startup task");
    Ok(())
}

#[cfg(windows)]
fn windows_startup_task(executable: &Path) -> String {
    format!("\"{}\" run", executable.display())
}

#[cfg(windows)]
fn uninstall_platform() -> Result<()> {
    command(
        "schtasks.exe",
        &["/Delete", "/F", "/TN", "Mimorii Agent Deskopt"],
    )
}

#[cfg(not(any(target_os = "linux", windows)))]
fn install_platform(_executable: &Path) -> Result<()> {
    bail!("automatic service installation is supported on Linux and Windows")
}

#[cfg(not(any(target_os = "linux", windows)))]
fn uninstall_platform() -> Result<()> {
    bail!("automatic service installation is supported on Linux and Windows")
}

fn command(program: &str, arguments: &[&str]) -> Result<()> {
    let status = Command::new(program).args(arguments).status()?;
    if !status.success() {
        bail!("{program} failed with status {status}");
    }
    Ok(())
}

#[cfg(test)]
#[path = "service_tests.rs"]
mod tests;
