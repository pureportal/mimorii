use std::sync::Mutex;

use super::{RuntimeState, RuntimeStatus, format_age};
use crate::activity::CheckActivity;
use crate::models::{CheckState, CheckType};
use crate::runtime::RuntimeReporter;
use crate::test_support::temporary_path;

#[derive(Default)]
struct RecordingReporter {
    errors: Mutex<Vec<String>>,
}

impl RuntimeReporter for RecordingReporter {
    fn info(&self, _message: &str) {}

    fn error(&self, message: &str) {
        self.errors.lock().unwrap().push(message.to_owned());
    }
}

#[test]
fn formats_ages_for_people() {
    assert_eq!(format_age(2), "just now");
    assert_eq!(format_age(42), "42 seconds ago");
    assert_eq!(format_age(60), "1 minute ago");
    assert_eq!(format_age(7_200), "2 hours ago");
    assert_eq!(format_age(86_400 * 3), "3 days ago");
}

#[test]
fn records_contact_failures_and_recovery() {
    let path = temporary_path("agent-state.json");
    let reporter = RecordingReporter::default();
    let mut status = RuntimeStatus::new(path.clone(), &reporter);

    status.failed("could not reach the Mimorii server");
    status.set_pending_snapshots(3);
    status.persist();
    let failed = RuntimeState::load(&path).unwrap().unwrap();
    assert_eq!(
        failed.last_error.as_deref(),
        Some("could not reach the Mimorii server")
    );
    assert_eq!(failed.pending_snapshots, 3);
    assert_eq!(failed.last_contact_at, None);
    assert_eq!(
        reporter.errors.lock().unwrap().as_slice(),
        ["could not reach the Mimorii server"]
    );

    status.contacted();
    status.uploaded();
    status.succeeded();
    status.persist();
    let recovered = RuntimeState::load(&path).unwrap().unwrap();
    let summary = recovered.summary(recovered.last_contact_at.unwrap() + 30);
    assert_eq!(summary.last_error, None);
    assert_eq!(summary.last_contact_seconds_ago, Some(30));

    std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
}

#[test]
fn restarts_keep_the_last_successful_contact() {
    let path = temporary_path("agent-state.json");
    let reporter = RecordingReporter::default();
    let mut first = RuntimeStatus::new(path.clone(), &reporter);
    first.contacted();
    first.uploaded();
    first.failed("could not reach the Mimorii server");
    first.persist();
    let before = RuntimeState::load(&path).unwrap().unwrap();

    RuntimeStatus::new(path.clone(), &reporter);

    let restarted = RuntimeState::load(&path).unwrap().unwrap();
    assert_eq!(restarted.last_contact_at, before.last_contact_at);
    assert_eq!(restarted.last_upload_at, before.last_upload_at);
    assert_eq!(restarted.last_error, None);

    std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
}

fn activity(checked_at: u64, target: &str, status: CheckState) -> CheckActivity {
    CheckActivity {
        checked_at,
        check_type: CheckType::Tcp,
        target: target.to_owned(),
        status,
        latency_ms: Some(4.0),
        message: None,
    }
}

#[test]
fn recent_checks_keep_the_newest_results_across_restarts() {
    let path = temporary_path("agent-state.json");
    let reporter = RecordingReporter::default();
    let mut first = RuntimeStatus::new(path.clone(), &reporter);
    first.record_checks(
        (0..45)
            .map(|index| activity(100, &format!("old-{index}:22"), CheckState::Up))
            .collect(),
    );
    first.record_checks(vec![
        activity(200, "db.internal:5432", CheckState::Down),
        activity(200, "cache.internal:6379", CheckState::Up),
    ]);
    first.record_checks(Vec::new());
    first.persist();

    RuntimeStatus::new(path.clone(), &reporter);
    let restarted = RuntimeState::load(&path).unwrap().unwrap();
    assert_eq!(restarted.recent_checks.len(), 47);
    assert_eq!(restarted.recent_checks[0].target, "db.internal:5432");
    assert_eq!(restarted.recent_checks[1].target, "cache.internal:6379");

    let mut full = RuntimeStatus::new(path.clone(), &reporter);
    full.record_checks(
        (0..10)
            .map(|index| activity(300, &format!("new-{index}:22"), CheckState::Up))
            .collect(),
    );
    full.persist();
    let summary = RuntimeState::load(&path).unwrap().unwrap().summary(330);
    assert_eq!(summary.recent_checks.len(), 50);
    assert_eq!(summary.recent_checks[0].target, "new-0:22");
    assert_eq!(summary.recent_checks[0].checked_seconds_ago, 30);
    assert_eq!(summary.recent_checks[49].target, "old-37:22");

    std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
}

#[test]
fn state_without_recent_checks_loads_as_empty_activity() {
    let path = temporary_path("agent-state.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(
        &path,
        r#"{"agentVersion":"15.0.0","startedAt":1,"updatedAt":2,"lastContactAt":null,"lastUploadAt":null,"lastError":null,"lastErrorAt":null,"pendingSnapshots":0}"#,
    )
    .unwrap();
    assert!(
        RuntimeState::load(&path)
            .unwrap()
            .unwrap()
            .recent_checks
            .is_empty()
    );
    std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
}

#[test]
fn missing_state_means_the_agent_has_not_run() {
    assert_eq!(
        RuntimeState::load(&temporary_path("missing-state.json")).unwrap(),
        None
    );
}
