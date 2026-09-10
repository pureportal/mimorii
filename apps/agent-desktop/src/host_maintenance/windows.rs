#[cfg(windows)]
use std::process::Command;
#[cfg(windows)]
use std::time::Instant;

#[cfg(windows)]
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Deserialize;

#[cfg(windows)]
use super::{Config, command};
use super::{Issues, Observation, Observations, Updates};

#[cfg(windows)]
pub(super) fn collect(config: &Config, deadline: Instant) -> Observations {
    let Some(system_root) = std::env::var_os("SystemRoot") else {
        return Observations::unavailable("Windows system directory is unavailable");
    };
    let script: Vec<u8> = include_str!("windows.ps1")
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect();
    let mut process = Command::new(
        std::path::Path::new(&system_root).join("System32/WindowsPowerShell/v1.0/powershell.exe"),
    );
    process
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
        ])
        .arg(STANDARD.encode(script));
    for (key, enabled) in [
        (
            "UPDATES",
            config.security_updates || config.software_updates,
        ),
        ("REBOOT", config.reboot_required),
        ("SECURITY", config.security),
        ("SERVICES", config.failed_services),
    ] {
        process.env(
            format!("MIMORII_ASSESS_{key}"),
            if enabled { "1" } else { "0" },
        );
    }
    match command::run(process, deadline) {
        Ok(output) => parse(&output.text, output.failure.as_deref()),
        Err(error) => Observations::unavailable(&error.to_string()),
    }
}

#[derive(Deserialize)]
#[serde(tag = "check", content = "result", rename_all = "camelCase")]
enum Probe {
    Updates(Observation<Updates>),
    Reboot(Observation<Issues>),
    Security(Observation<Issues>),
    Services(Observation<Issues>),
}

fn parse(output: &str, failure: Option<&str>) -> Observations {
    let mut observations = Observations::unavailable(
        failure.unwrap_or("The host returned incomplete assessment data"),
    );
    for line in output
        .split_inclusive('\n')
        .filter(|line| !line.trim().is_empty())
    {
        match serde_json::from_str::<Probe>(line) {
            Ok(Probe::Updates(result)) => observations.updates = result,
            Ok(Probe::Reboot(result)) => observations.reboot = result,
            Ok(Probe::Security(result)) => observations.security = result,
            Ok(Probe::Services(result)) => observations.services = result,
            Err(_) if failure.is_some() && !line.ends_with('\n') => break,
            Err(_) => return Observations::unavailable("Windows returned invalid assessment data"),
        }
    }
    observations
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_completed_probes_when_the_update_search_times_out() {
        let output = r#"{"check":"security","result":{"status":"available","data":{"count":1,"examples":["Windows Firewall is disabled: Public"],"unavailable":[]}}}"#;
        let observations = parse(output, Some("Assessment timed out"));
        assert!(
            matches!(observations.security, Observation::Available { data } if data.count == 1)
        );
        assert!(
            matches!(observations.updates, Observation::Unavailable { reason } if reason.contains("timed out"))
        );
    }

    #[test]
    fn missing_or_malformed_data_never_passes() {
        for output in [
            "",
            "{}",
            "not JSON",
            r#"{"check":"updates","result":{"status":"available","data":{}}}"#,
        ] {
            assert!(matches!(
                parse(output, None).updates,
                Observation::Unavailable { .. }
            ));
        }
    }

    #[test]
    fn preserves_completed_probes_when_the_last_record_is_truncated() {
        let output = "{\"check\":\"security\",\"result\":{\"status\":\"available\",\"data\":{\"count\":1,\"examples\":[\"Firewall disabled\"],\"unavailable\":[]}}}\n{\"check\":\"updates\"";
        let observations = parse(output, Some("Assessment timed out"));
        assert!(
            matches!(observations.security, Observation::Available { data } if data.count == 1)
        );
        assert!(matches!(
            observations.updates,
            Observation::Unavailable { .. }
        ));
    }
}
