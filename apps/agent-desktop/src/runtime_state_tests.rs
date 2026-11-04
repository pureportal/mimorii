use std::sync::Mutex;

use super::{RuntimeState, RuntimeStatus, format_age};
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
    assert_eq!(summary.lines()[0], "last contact: 30 seconds ago");

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

#[test]
fn missing_state_means_the_agent_has_not_run() {
    assert_eq!(
        RuntimeState::load(&temporary_path("missing-state.json")).unwrap(),
        None
    );
}
