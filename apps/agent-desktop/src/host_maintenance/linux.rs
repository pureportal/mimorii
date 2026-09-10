use std::fs;
use std::path::Path;
#[cfg(target_os = "linux")]
use std::process::Command;
#[cfg(target_os = "linux")]
use std::time::Instant;

#[cfg(target_os = "linux")]
use super::{Config, Observations, command};
use super::{Issues, Observation};

#[cfg(target_os = "linux")]
pub(super) fn collect(config: &Config, deadline: Instant) -> Observations {
    let mut observations = Observations::unavailable("Assessment was not requested");
    if config.security {
        observations.security = security(Path::new("/sys/devices/system/cpu/vulnerabilities"));
    }
    if config.reboot_required {
        observations.reboot = reboot(Path::new("/"));
    }
    if config.failed_services {
        observations.services = if Path::new("/run/systemd/system").is_dir() {
            let mut process = Command::new("/usr/bin/systemctl");
            process.args([
                "list-units",
                "--type=service",
                "--state=failed",
                "--all",
                "--no-legend",
                "--plain",
                "--no-pager",
                "--full",
            ]);
            match command::run(process, deadline) {
                Ok(output) if output.failure.is_none() => services(&output.text),
                Ok(output) => Observation::unavailable(output.failure.unwrap()),
                Err(error) => Observation::unavailable(error.to_string()),
            }
        } else {
            Observation::unavailable("Failed service assessment requires systemd")
        };
    }
    if config.security_updates || config.software_updates {
        observations.updates = if Path::new("/var/lib/dpkg/status").is_file() {
            let mut process = Command::new("/usr/bin/python3");
            process.args(["-I", "-B", "-c", include_str!("apt.py")]);
            match command::run(process, deadline) {
                Ok(output) if output.failure.is_none() => serde_json::from_str(&output.text)
                    .unwrap_or_else(|_| {
                        Observation::unavailable("APT returned invalid assessment data")
                    }),
                Ok(output) => Observation::unavailable(output.failure.unwrap()),
                Err(_) => {
                    Observation::unavailable("APT assessment requires Python 3 and python3-apt")
                }
            }
        } else {
            Observation::unavailable("Update assessment requires a Debian or Ubuntu host with APT")
        };
    }
    observations
}

fn reboot(root: &Path) -> Observation<Issues> {
    let marker = root.join("run/reboot-required");
    match marker.try_exists() {
        Ok(true) => Observation::Available {
            data: Issues {
                count: 1,
                examples: vec!["The system requires a restart".to_owned()],
                unavailable: Vec::new(),
            },
        },
        Err(_) => Observation::unavailable("The restart marker could not be read"),
        Ok(false) => {
            match root
                .join("usr/share/update-notifier/notify-reboot-required")
                .try_exists()
            {
                Ok(true) => Observation::Available {
                    data: Issues {
                        count: 0,
                        examples: Vec::new(),
                        unavailable: Vec::new(),
                    },
                },
                _ => Observation::unavailable("No restart marker provider is installed"),
            }
        }
    }
}

fn security(directory: &Path) -> Observation<Issues> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(_) => {
            return Observation::unavailable("Kernel CPU vulnerability reports could not be read");
        }
    };
    let mut issues = Issues {
        count: 0,
        examples: Vec::new(),
        unavailable: Vec::new(),
    };
    let mut assessed = 0;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                issues
                    .unavailable
                    .push("A kernel vulnerability report could not be read".to_owned());
                continue;
            }
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        let state = match fs::read_to_string(entry.path()) {
            Ok(state) => state.trim().to_owned(),
            Err(_) => {
                issues.unavailable.push(format!("{name} could not be read"));
                continue;
            }
        };
        assessed += 1;
        if state.to_ascii_lowercase().contains("vulnerable") && !state.starts_with("Not affected") {
            issues.count += 1;
            issues.examples.push(format!("{name}: {state}"));
        } else if state.to_ascii_lowercase().contains("unknown")
            || (!state.starts_with("Not affected")
                && !state.starts_with("Mitigation:")
                && !state.starts_with("KVM: Mitigation:"))
        {
            issues.unavailable.push(format!("{name}: {state}"));
        }
    }
    if assessed == 0 && issues.unavailable.is_empty() {
        return Observation::unavailable("The kernel provides no CPU vulnerability reports");
    }
    issues.examples.sort();
    issues.examples.truncate(5);
    issues.unavailable.sort();
    issues.unavailable.truncate(5);
    Observation::Available { data: issues }
}

fn services(output: &str) -> Observation<Issues> {
    let mut names = Vec::new();
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        let fields: Vec<_> = line.split_whitespace().collect();
        if fields.len() < 4 || !fields[0].ends_with(".service") || fields[2] != "failed" {
            return Observation::unavailable("systemd returned invalid service data");
        }
        names.push(fields[0].to_owned());
    }
    names.sort();
    names.dedup();
    let count = names.len() as u64;
    names.truncate(5);
    Observation::Available {
        data: Issues {
            count,
            examples: names,
            unavailable: Vec::new(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_unmitigated_and_partially_mitigated_vulnerabilities() {
        let directory = tempfile::tempdir().unwrap();
        for (name, value) in [
            ("safe", "Not affected"),
            ("mitigated", "Mitigation: Retpolines"),
            ("itlb_multihit", "KVM: Mitigation: VMX disabled"),
            ("mds", "Mitigation: Clear CPU buffers; SMT vulnerable"),
            ("spectre_v2", "Vulnerable"),
            ("unknown", "Unknown: Dependent on hypervisor status"),
        ] {
            fs::write(directory.path().join(name), value).unwrap();
        }
        let Observation::Available { data } = security(directory.path()) else {
            panic!("expected assessment")
        };
        assert_eq!(data.count, 2);
        assert_eq!(data.unavailable.len(), 1);
    }

    #[test]
    fn absent_reports_and_unprovided_restart_markers_are_unavailable() {
        let directory = tempfile::tempdir().unwrap();
        assert!(matches!(
            security(directory.path()),
            Observation::Unavailable { .. }
        ));
        assert!(matches!(
            reboot(directory.path()),
            Observation::Unavailable { .. }
        ));
        fs::create_dir(directory.path().join("run")).unwrap();
        fs::write(directory.path().join("run/reboot-required"), "").unwrap();
        assert!(
            matches!(reboot(directory.path()), Observation::Available { data } if data.count == 1)
        );
    }

    #[test]
    fn detects_failed_services_without_treating_bad_output_as_empty() {
        assert!(
            matches!(services("api.service loaded failed failed API\nworker.service loaded failed failed Worker\n"), Observation::Available { data } if data.count == 2)
        );
        assert!(matches!(services(""), Observation::Available { data } if data.count == 0));
        assert!(matches!(
            services("Failed to connect to bus"),
            Observation::Unavailable { .. }
        ));
    }
}
