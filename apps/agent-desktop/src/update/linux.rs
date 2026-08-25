use std::fs::File;
use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result, bail};
use flate2::read::GzDecoder;
use tempfile::NamedTempFile;

use super::InstallOutcome;
use super::github::DownloadedPackage;

const BINARY_NAME: &str = "mimorii-agent-desktop";
const MAX_BINARY_BYTES: u64 = 128 * 1024 * 1024;

pub fn warn_if_elevated(privileged: bool) {
    if !privileged && crate::linux::running_as_root() {
        eprintln!("Warning: Running the update as root");
    }
}

pub fn delegate_if_needed(json: bool, privileged: bool) -> Result<bool> {
    let executable = std::env::current_exe()?;
    let directory = executable
        .parent()
        .context("The Mimorii Agent installation directory is unavailable")?;
    match tempfile::Builder::new()
        .prefix(".mimorii-update-check-")
        .tempfile_in(directory)
    {
        Ok(file) => {
            drop(file);
            Ok(false)
        }
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied && !privileged => {
            let mut command = Command::new("sudo");
            command
                .arg("--")
                .arg(&executable)
                .arg("update")
                .arg("--privileged");
            if json {
                command.arg("--json");
            }
            if json {
                let output = command
                    .output()
                    .context("sudo is required to update the installed Mimorii Agent")?;
                if !output.status.success() {
                    let error = String::from_utf8_lossy(&output.stderr).trim().to_owned();
                    bail!("The privileged Mimorii Agent update failed: {error}");
                }
                crate::service::restart_if_installed()?;
                print!(
                    "{}",
                    String::from_utf8(output.stdout)
                        .context("The privileged updater returned unreadable output")?
                );
                return Ok(true);
            }
            let status = command
                .status()
                .context("sudo is required to update the installed Mimorii Agent")?;
            if !status.success() {
                bail!("The privileged Mimorii Agent update failed with {status}");
            }
            crate::service::restart_if_installed()?;
            Ok(true)
        }
        Err(error) => Err(error)
            .context("The Mimorii Agent installation directory cannot stage an atomic update"),
    }
}

pub fn install(mut package: DownloadedPackage, privileged: bool) -> Result<InstallOutcome> {
    let executable = std::env::current_exe()?;
    let directory = executable
        .parent()
        .context("The Mimorii Agent installation directory is unavailable")?;
    let mut staged = tempfile::Builder::new()
        .prefix(".mimorii-agent-update-")
        .tempfile_in(directory)
        .context("The updated executable could not be staged beside the installation")?;
    extract_binary(package.file.as_file_mut(), &mut staged)?;
    staged.as_file_mut().flush()?;
    staged.as_file_mut().sync_all()?;
    let mode = executable.metadata()?.permissions().mode();
    staged
        .as_file()
        .set_permissions(std::fs::Permissions::from_mode(mode))?;
    staged
        .persist(&executable)
        .map_err(|error| error.error)
        .context("The installed Mimorii Agent executable could not be replaced")?;
    File::open(directory)?.sync_all()?;

    if !privileged {
        crate::service::restart_if_installed()?;
    }
    Ok(InstallOutcome::Installed)
}

fn extract_binary(archive_file: &mut File, destination: &mut NamedTempFile) -> Result<()> {
    let decoder = GzDecoder::new(archive_file);
    let mut archive = tar::Archive::new(decoder);
    let mut found = false;
    for entry in archive
        .entries()
        .context("The Linux update archive is invalid")?
    {
        let mut entry = entry?;
        let path = entry.path()?;
        if path.as_ref() != Path::new(BINARY_NAME) || !entry.header().entry_type().is_file() {
            bail!("The Linux update archive contains an unexpected entry");
        }
        if found || entry.size() == 0 || entry.size() > MAX_BINARY_BYTES {
            bail!("The Linux update archive contains an invalid executable");
        }
        let copied = std::io::copy(
            &mut entry.by_ref().take(MAX_BINARY_BYTES + 1),
            destination.as_file_mut(),
        )?;
        if copied != entry.size() {
            bail!("The Linux update executable size is invalid");
        }
        found = true;
    }
    if !found {
        bail!("The Linux update archive does not contain {BINARY_NAME}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::{Seek, SeekFrom};

    use flate2::Compression;
    use flate2::write::GzEncoder;

    use super::*;

    fn archive(entries: &[(&str, &[u8])]) -> NamedTempFile {
        let encoder = GzEncoder::new(Vec::new(), Compression::default());
        let mut builder = tar::Builder::new(encoder);
        for (name, content) in entries {
            let mut header = tar::Header::new_gnu();
            header.set_size(content.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder.append_data(&mut header, *name, *content).unwrap();
        }
        let encoder = builder.into_inner().unwrap();
        let bytes = encoder.finish().unwrap();
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(&bytes).unwrap();
        file.seek(SeekFrom::Start(0)).unwrap();
        file
    }

    #[test]
    fn extracts_the_single_expected_executable() {
        let mut source = archive(&[(BINARY_NAME, b"agent")]);
        let mut destination = NamedTempFile::new().unwrap();
        extract_binary(source.as_file_mut(), &mut destination).unwrap();
        destination.seek(SeekFrom::Start(0)).unwrap();
        let mut content = String::new();
        destination.read_to_string(&mut content).unwrap();
        assert_eq!(content, "agent");
    }

    #[test]
    fn rejects_archives_with_extra_entries() {
        let mut source = archive(&[(BINARY_NAME, b"agent"), ("unexpected", b"data")]);
        let mut destination = NamedTempFile::new().unwrap();
        assert!(extract_binary(source.as_file_mut(), &mut destination).is_err());
    }
}
