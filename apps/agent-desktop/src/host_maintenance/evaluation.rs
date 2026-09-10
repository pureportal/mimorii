use std::collections::BTreeMap;

use serde_json::{Value, json};

use super::{Config, Issues, Observation, Observations};

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Status {
    Okay,
    Unavailable,
    Warning,
    Critical,
}

struct Finding {
    status: Status,
    message: String,
}

#[derive(Default)]
pub(crate) struct Report {
    pub metrics: BTreeMap<String, Value>,
    findings: Vec<Finding>,
}

impl Report {
    pub fn critical(&self) -> bool {
        self.findings
            .iter()
            .any(|finding| finding.status == Status::Critical)
    }

    pub fn warning(&self) -> bool {
        self.findings
            .iter()
            .any(|finding| finding.status != Status::Okay)
    }

    pub fn message(&self) -> Option<String> {
        let mut findings: Vec<_> = self
            .findings
            .iter()
            .filter(|finding| finding.status != Status::Okay)
            .collect();
        findings.sort_by_key(|finding| std::cmp::Reverse(finding.status));
        (!findings.is_empty()).then(|| {
            findings
                .iter()
                .map(|finding| finding.message.as_str())
                .collect::<Vec<_>>()
                .join("; ")
                .chars()
                .take(500)
                .collect()
        })
    }

    fn finding(&mut self, key: &str, label: &str, status: Status, detail: String) {
        let state = match status {
            Status::Okay => "okay",
            Status::Unavailable => "unavailable",
            Status::Warning => "warning",
            Status::Critical => "critical",
        };
        self.metrics
            .insert(format!("maintenance.{key}.status"), json!(state));
        let detail: String = detail
            .chars()
            .filter(|c| !c.is_control())
            .take(1_000)
            .collect();
        self.metrics
            .insert(format!("maintenance.{key}.detail"), json!(detail));
        self.findings.push(Finding {
            status,
            message: format!("{label}: {detail}"),
        });
    }

    fn unavailable(&mut self, key: &str, label: &str, reason: &str) {
        self.finding(
            key,
            label,
            Status::Unavailable,
            format!("Unavailable: {reason}"),
        );
    }

    fn issues(
        &mut self,
        key: &str,
        label: &str,
        observation: Observation<Issues>,
        threshold: u64,
        severity: Status,
    ) {
        match observation {
            Observation::Unavailable { reason } => self.unavailable(key, label, &reason),
            Observation::Available { data } => {
                let status = if data.count >= threshold {
                    severity
                } else if data.unavailable.is_empty() {
                    Status::Okay
                } else {
                    Status::Unavailable
                };
                let detail = issue_detail(data.count, &data.examples, &data.unavailable);
                self.finding(key, label, status, detail);
                if key == "failedServices" && (data.count > 0 || data.unavailable.is_empty()) {
                    self.metrics
                        .insert("failedServiceCount".to_owned(), json!(data.count));
                }
            }
        }
    }
}

pub(super) fn evaluate(config: &Config, observations: Observations) -> Report {
    let mut report = Report::default();
    if config.security_updates || config.software_updates {
        updates(config, &mut report, observations.updates);
    }
    if config.reboot_required {
        report.issues(
            "rebootRequired",
            "Restart",
            observations.reboot,
            1,
            Status::Warning,
        );
    }
    if config.security {
        report.issues(
            "security",
            "Security",
            observations.security,
            1,
            Status::Critical,
        );
    }
    if config.failed_services {
        report.issues(
            "failedServices",
            "Failed services",
            observations.services,
            config.failed_service_warning_count,
            Status::Warning,
        );
    }
    report
}

fn updates(config: &Config, report: &mut Report, observation: Observation<super::Updates>) {
    let data = match observation {
        Observation::Unavailable { reason } => {
            if config.security_updates {
                report.unavailable("securityUpdates", "Security updates", &reason);
            }
            if config.software_updates {
                report.unavailable("softwareUpdates", "Software updates", &reason);
            }
            return;
        }
        Observation::Available { data } => data,
    };
    let mut unavailable = data.unavailable;
    match data
        .data_age_hours
        .filter(|age| age.is_finite() && *age >= 0.0)
    {
        Some(age) => {
            report
                .metrics
                .insert("updateDataAgeHours".to_owned(), json!(age));
            if age > config.max_update_age_hours as f64 {
                unavailable.push(format!(
                    "Update data is {:.0} hours old; refresh the host's update data",
                    age
                ));
            }
        }
        None => unavailable
            .push("Update data age is unknown; refresh the host's update data".to_owned()),
    }
    if unavailable.is_empty() {
        report.finding("updateData", "Update data", Status::Okay, String::new());
    } else {
        report.unavailable("updateData", "Update data", &unavailable.join("; "));
    }
    if config.security_updates {
        match data.security_count {
            Some(count) => {
                update_count(
                    report,
                    config,
                    UpdateKind::Security,
                    count,
                    &data.security_examples,
                    &unavailable,
                );
            }
            None => report.unavailable(
                "securityUpdates",
                "Security updates",
                "Security update classification is unavailable from the configured repositories",
            ),
        }
    }
    if config.software_updates {
        update_count(
            report,
            config,
            UpdateKind::Software,
            data.count,
            &data.examples,
            &unavailable,
        );
    }
}

enum UpdateKind {
    Security,
    Software,
}

fn update_count(
    report: &mut Report,
    config: &Config,
    kind: UpdateKind,
    count: u64,
    examples: &[String],
    unavailable: &[String],
) {
    let (key, label, metric, threshold, severity) = match kind {
        UpdateKind::Security => (
            "securityUpdates",
            "Security updates",
            "pendingSecurityUpdateCount",
            config.security_update_critical_count,
            Status::Critical,
        ),
        UpdateKind::Software => (
            "softwareUpdates",
            "Software updates",
            "pendingUpdateCount",
            config.software_update_warning_count,
            Status::Warning,
        ),
    };
    let status = if count >= threshold {
        severity
    } else if unavailable.is_empty() {
        Status::Okay
    } else {
        Status::Unavailable
    };
    let detail = if count == 0 && !unavailable.is_empty() {
        "Unavailable: update data is incomplete or stale".to_owned()
    } else if count == 0 {
        String::new()
    } else {
        format!(
            "{count} pending{}{}",
            example_suffix(examples),
            if unavailable.is_empty() {
                ""
            } else {
                "; assessment incomplete"
            }
        )
    };
    report.finding(key, label, status, detail);
    if count > 0 || unavailable.is_empty() {
        report.metrics.insert(metric.to_owned(), json!(count));
    }
}

fn issue_detail(count: u64, examples: &[String], unavailable: &[String]) -> String {
    let mut detail = if count == 0 {
        String::new()
    } else {
        format!(
            "{count} {}{}",
            if count == 1 { "issue" } else { "issues" },
            example_suffix(examples)
        )
    };
    if !unavailable.is_empty() {
        if !detail.is_empty() {
            detail.push_str("; ");
        }
        detail.push_str(&format!("Unavailable: {}", unavailable.join("; ")));
    }
    detail
}

fn example_suffix(examples: &[String]) -> String {
    if examples.is_empty() {
        String::new()
    } else {
        format!(
            ": {}",
            examples
                .iter()
                .take(5)
                .map(String::as_str)
                .collect::<Vec<_>>()
                .join(", ")
        )
    }
}
