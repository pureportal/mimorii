use std::io::{Read, Seek, SeekFrom};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};

const MAX_OUTPUT_BYTES: u64 = 256 * 1024;

pub(super) struct CommandOutput {
    pub text: String,
    pub failure: Option<String>,
}

pub(super) fn run(mut command: Command, deadline: Instant) -> Result<CommandOutput> {
    if Instant::now() >= deadline {
        return Ok(CommandOutput {
            text: String::new(),
            failure: Some("Assessment timed out; check the host's services".to_owned()),
        });
    }
    let mut output = tempfile::tempfile().context("Cannot create assessment output file")?;
    command
        .stdin(Stdio::null())
        .stdout(output.try_clone()?)
        .stderr(Stdio::null())
        .env("LC_ALL", "C");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .context("Assessment command could not start")?;
    let failure =
        loop {
            match child.try_wait() {
                Ok(Some(status)) => break (!status.success()).then(|| {
                    "Assessment command failed; check the agent account's access to the data source"
                        .to_owned()
                }),
                Err(error) => {
                    child.kill().context("Could not stop assessment command")?;
                    child.wait().context("Could not reap assessment command")?;
                    return Err(error).context("Could not read assessment command status");
                }
                Ok(None) => {}
            }
            let reason = match output.metadata() {
                Ok(metadata) if metadata.len() > MAX_OUTPUT_BYTES => {
                    Some("Assessment output exceeded its size limit")
                }
                Err(_) => Some("Assessment output could not be read"),
                _ if Instant::now() >= deadline => {
                    Some("Assessment timed out; check the host's services")
                }
                _ => None,
            };
            if let Some(reason) = reason {
                child.kill().context("Could not stop assessment command")?;
                child.wait().context("Could not reap assessment command")?;
                break Some(reason.to_owned());
            }
            std::thread::sleep(Duration::from_millis(20));
        };
    output.seek(SeekFrom::Start(0))?;
    let mut bytes = Vec::new();
    output.take(MAX_OUTPUT_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_OUTPUT_BYTES {
        return Ok(CommandOutput {
            text: String::new(),
            failure: Some("Assessment output exceeded its size limit".to_owned()),
        });
    }
    Ok(CommandOutput {
        text: String::from_utf8(bytes).context("Assessment output is not UTF-8")?,
        failure,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_fixture() {
        match std::env::var("MIMORII_ASSESSMENT_TEST").as_deref() {
            Ok("timeout") => {
                std::thread::sleep(Duration::from_secs(10));
            }
            Ok("oversize") => println!("{}", "x".repeat(MAX_OUTPUT_BYTES as usize + 1)),
            _ => {}
        }
    }

    #[test]
    fn kills_timed_out_commands() {
        let mut process = Command::new(std::env::current_exe().unwrap());
        process
            .args([
                "--exact",
                "host_maintenance::command::tests::command_fixture",
                "--nocapture",
            ])
            .env("MIMORII_ASSESSMENT_TEST", "timeout");
        let start = Instant::now();
        let output = run(process, start + Duration::from_secs(2)).unwrap();
        assert!(output.failure.unwrap().contains("timed out"));
        assert!(start.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn rejects_oversized_output_even_when_a_command_exits_successfully() {
        let mut process = Command::new(std::env::current_exe().unwrap());
        process
            .args([
                "--exact",
                "host_maintenance::command::tests::command_fixture",
                "--nocapture",
            ])
            .env("MIMORII_ASSESSMENT_TEST", "oversize");
        let output = run(process, Instant::now() + Duration::from_secs(30)).unwrap();
        assert!(output.failure.unwrap().contains("size limit"));
    }
}
