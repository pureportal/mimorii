use serde_json::json;

use super::{
    AgentStatus, CheckStatus, DoctorReport, Outcome, ServiceState, count_label, format_age,
};

#[test]
fn status_includes_service_runtime_activity_and_log_location() {
    let status: AgentStatus = serde_json::from_value(json!({
        "agentVersion": "15.0.0",
        "service": "not-installed",
        "enrolled": true,
        "serverUrl": "https://mimorii.app/api",
        "targetPolicy": null,
        "configurationError": null,
        "runtime": {
            "updatedSecondsAgo": 2,
            "lastContactSecondsAgo": 75,
            "lastUploadSecondsAgo": 75,
            "lastError": "trigger poll failed: agent key was rejected",
            "lastErrorSecondsAgo": 2,
            "pendingSnapshots": 4,
            "recentChecks": [{
                "checkedSecondsAgo": 30,
                "checkType": "tcp",
                "target": "db.internal:5432",
                "status": "down",
                "latencyMs": null,
                "message": "connection refused"
            }]
        },
        "logPath": "C:/ProgramData/Mimorii/Agent/agent-desktop.log"
    }))
    .unwrap();

    assert_eq!(status.service, ServiceState::NotInstalled);
    assert!(!status.service.can_start());
    let runtime = status.runtime.unwrap();
    assert_eq!(runtime.pending_snapshots, 4);
    let check = &runtime.recent_checks[0];
    assert_eq!(check.status, CheckStatus::Down);
    assert_eq!(check.kind_label(), "TCP");
    assert_eq!(check.result_label(), "connection refused");
    assert!(status.log_path.ends_with("agent-desktop.log"));
}

#[test]
fn service_actions_follow_the_service_state() {
    assert!(ServiceState::Running.can_stop());
    assert!(!ServiceState::Running.can_start());
    assert!(ServiceState::Stopped.can_start());
    assert!(ServiceState::Failed.can_start());
    assert!(!ServiceState::Starting.can_start());
    assert!(!ServiceState::Starting.can_stop());
}

#[test]
fn diagnostics_report_counts_outcomes_and_copies_as_text() {
    let report: DoctorReport = serde_json::from_value(json!({
        "healthy": false,
        "checks": [
            {"id": "server", "label": "Server", "outcome": "fail", "detail": "The agent key was rejected", "hint": "Enroll again."},
            {"id": "queue", "label": "Upload queue", "outcome": "pass", "detail": "Empty", "hint": null}
        ]
    }))
    .unwrap();
    assert_eq!(report.count(Outcome::Fail), 1);
    assert_eq!(report.count(Outcome::Warn), 0);
    assert_eq!(
        report.text(),
        "FAIL  Server: The agent key was rejected\n      Enroll again.\nOK    Upload queue: Empty"
    );
}

#[test]
fn ages_and_counts_read_naturally() {
    assert_eq!(format_age(1), "just now");
    assert_eq!(format_age(75), "1 minute ago");
    assert_eq!(format_age(7_300), "2 hours ago");
    assert_eq!(count_label(1, "snapshot"), "1 snapshot");
    assert_eq!(count_label(4, "snapshot"), "4 snapshots");
}
