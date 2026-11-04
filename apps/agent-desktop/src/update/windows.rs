use std::fs::{self, File, OpenOptions};
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{Context, Result, bail};
use windows_sys::Win32::Foundation::CloseHandle;
use windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ;
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject,
};

use super::InstallOutcome;
use super::github::{DownloadedPackage, sha256_file};

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn staging_directory() -> Result<PathBuf> {
    let directory = crate::config::update_staging_directory()?;
    fs::create_dir_all(&directory).with_context(|| {
        format!(
            "could not prepare {}; run this command from an administrator terminal",
            directory.display()
        )
    })?;
    Ok(directory)
}

pub fn install(package: DownloadedPackage) -> Result<InstallOutcome> {
    let directory = staging_directory()?;
    let (package_file, package_path) = package.file.keep()?;
    drop(package_file);
    let executable = std::env::current_exe()?;
    let mut helper = tempfile::Builder::new()
        .prefix("mimorii-agent-updater-")
        .suffix(".exe")
        .tempfile_in(&directory)?;
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
    validate_package_path(&package, &staging_directory()?)?;
    wait_for_parent(parent_pid);
    let mut locked = open_read_only_locked(&package)?;
    if sha256_file(&mut locked)? != expected_sha256 {
        drop(locked);
        let _ = fs::remove_file(&package);
        bail!("The staged Windows update failed SHA-256 verification");
    }

    let log = package.with_extension("log");
    let status = Command::new("msiexec.exe")
        .arg("/package")
        .arg(&package)
        .arg("/passive")
        .arg("/norestart")
        .arg("/log")
        .arg(&log)
        .status()
        .context("Windows Installer could not start");
    drop(locked);
    let status = status?;
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

fn validate_package_path(path: &Path, staging_directory: &Path) -> Result<()> {
    let inside_staging = path.parent().is_some_and(|parent| {
        fs::canonicalize(parent).ok() == fs::canonicalize(staging_directory).ok()
    });
    if path.extension().and_then(|value| value.to_str()) != Some("msi")
        || !path.is_file()
        || !inside_staging
    {
        bail!("The staged Windows update package is invalid");
    }
    Ok(())
}

fn open_read_only_locked(path: &Path) -> Result<File> {
    OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .open(path)
        .with_context(|| format!("The staged Windows update {} is in use", path.display()))
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

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    #[test]
    fn verified_packages_cannot_be_replaced_while_installing() {
        let directory = crate::test_support::temporary_path("update-staging");
        fs::create_dir_all(&directory).unwrap();
        let package = directory.join("mimorii-agent-update.msi");
        fs::write(&package, b"verified package").unwrap();

        let locked = open_read_only_locked(&package).unwrap();

        assert_eq!(fs::read(&package).unwrap(), b"verified package");
        assert!(OpenOptions::new().write(true).open(&package).is_err());
        assert!(fs::remove_file(&package).is_err());
        drop(locked);
        OpenOptions::new()
            .write(true)
            .open(&package)
            .unwrap()
            .write_all(b"x")
            .unwrap();

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn only_packages_in_the_protected_staging_directory_are_installed() {
        let staging = crate::test_support::temporary_path("protected-staging");
        let elsewhere = crate::test_support::temporary_path("user-temp");
        fs::create_dir_all(&staging).unwrap();
        fs::create_dir_all(&elsewhere).unwrap();
        let staged = staging.join("update.msi");
        let outside = elsewhere.join("update.msi");
        fs::write(&staged, b"package").unwrap();
        fs::write(&outside, b"package").unwrap();

        assert!(validate_package_path(&staged, &staging).is_ok());
        assert!(validate_package_path(&outside, &staging).is_err());
        assert!(validate_package_path(&staging.join("missing.msi"), &staging).is_err());

        fs::remove_dir_all(staging.parent().unwrap()).unwrap();
        fs::remove_dir_all(elsewhere.parent().unwrap()).unwrap();
    }
}
