use std::fs::{self, File};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{Context, Result, bail};
use windows_sys::Win32::Foundation::CloseHandle;
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject,
};

use super::InstallOutcome;
use super::github::{DownloadedPackage, sha256_file};

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn install(package: DownloadedPackage) -> Result<InstallOutcome> {
    let (package_file, package_path) = package.file.keep()?;
    drop(package_file);
    let executable = std::env::current_exe()?;
    let mut helper = tempfile::Builder::new()
        .prefix("mimorii-agent-updater-")
        .suffix(".exe")
        .tempfile()?;
    std::io::copy(&mut File::open(&executable)?, helper.as_file_mut())?;
    helper.as_file_mut().sync_all()?;
    let (helper_file, helper_path) = helper.keep()?;
    drop(helper_file);

    let spawned = Command::new(&helper_path)
        .arg("apply-update")
        .arg("--package")
        .arg(&package_path)
        .arg("--sha256")
        .arg(&package.sha256)
        .arg("--parent-pid")
        .arg(std::process::id().to_string())
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    if let Err(error) = spawned {
        let _ = fs::remove_file(&package_path);
        let _ = fs::remove_file(&helper_path);
        return Err(error).context("The Mimorii Agent update installer could not start");
    }
    Ok(InstallOutcome::InstallerStarted)
}

pub fn apply(package: PathBuf, expected_sha256: &str, parent_pid: u32) -> Result<()> {
    validate_package_path(&package)?;
    let actual_sha256 = sha256_file(&mut File::open(&package)?)?;
    if actual_sha256 != expected_sha256 {
        bail!("The staged Windows update failed SHA-256 verification");
    }
    wait_for_parent(parent_pid);

    let log = package.with_extension("log");
    let status = Command::new("msiexec.exe")
        .arg("/package")
        .arg(&package)
        .arg("/passive")
        .arg("/norestart")
        .arg("/log")
        .arg(&log)
        .status()
        .context("Windows Installer could not start")?;
    let success = matches!(status.code(), Some(0 | 1641 | 3010));
    let _ = fs::remove_file(&package);
    if success {
        let _ = fs::remove_file(&log);
    }
    schedule_self_removal();
    if !success {
        bail!(
            "Windows Installer failed with {status}; details are in {}",
            log.display()
        );
    }
    Ok(())
}

fn validate_package_path(path: &Path) -> Result<()> {
    if path.extension().and_then(|value| value.to_str()) != Some("msi") || !path.is_file() {
        bail!("The staged Windows update package is invalid");
    }
    Ok(())
}

fn wait_for_parent(parent_pid: u32) {
    unsafe {
        let handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, parent_pid);
        if !handle.is_null() {
            WaitForSingleObject(handle, 60_000);
            CloseHandle(handle);
        }
    }
}

fn schedule_self_removal() {
    let Ok(executable) = std::env::current_exe() else {
        return;
    };
    let _ = Command::new("powershell.exe")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-WindowStyle")
        .arg("Hidden")
        .arg("-Command")
        .arg(
            "Start-Sleep -Milliseconds 500; Remove-Item -LiteralPath $env:MIMORII_UPDATE_HELPER -Force",
        )
        .env("MIMORII_UPDATE_HELPER", executable)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}
