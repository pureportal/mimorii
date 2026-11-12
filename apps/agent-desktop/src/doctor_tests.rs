use anyhow::anyhow;

use super::{
    DoctorReport, Outcome, render, runtime_checks, server_outcome, service_check, transport_check,
};
use crate::api::KeyRejected;
use crate::runtime_state::RuntimeState;
use crate::service_state::ServiceState;
use crate::test_support::plain;

#[test]
fn connection_checks_explain_how_to_recover() {
    assert_eq!(
        transport_check("https://mimorii.app/api").outcome,
        Outcome::Pass
    );
    let insecure = transport_check("http://10.0.0.5/api");
    assert_eq!(insecure.outcome, Outcome::Warn);
    assert!(insecure.hint.is_some());

    let reachable = server_outcome(Ok(84));
    assert_eq!(reachable.outcome, Outcome::Pass);
    assert_eq!(reachable.detail, "Reachable in 84 ms");

    let rejected = server_outcome(Err(anyhow::Error::from(KeyRejected)));
    assert_eq!(rejected.outcome, Outcome::Fail);
    assert_eq!(rejected.detail, "The agent key was rejected");
    assert!(rejected.hint.unwrap().contains("enroll again"));

    let unreachable = server_outcome(Err(anyhow!("could not reach the Mimorii server")));
    assert_eq!(unreachable.outcome, Outcome::Fail);
    assert!(unreachable.hint.unwrap().contains("firewall"));
}

#[test]
fn service_state_maps_to_outcomes_with_next_steps() {
    assert_eq!(service_check(ServiceState::Running).outcome, Outcome::Pass);
    assert!(service_check(ServiceState::Running).hint.is_none());
    assert_eq!(service_check(ServiceState::Starting).outcome, Outcome::Warn);
    let stopped = service_check(ServiceState::Stopped);
    assert_eq!(stopped.outcome, Outcome::Fail);
    assert!(stopped.hint.is_some());
    let missing = service_check(ServiceState::NotInstalled);
    assert_eq!(missing.detail, "Not installed");
    assert!(missing.hint.is_some());
}

#[test]
fn runtime_checks_flag_stale_contact_backlogs_and_errors() {
    let missing = runtime_checks(None, ServiceState::Stopped);
    assert_eq!(missing.len(), 1);
    assert_eq!(missing[0].outcome, Outcome::Warn);
    assert!(
        missing[0]
            .hint
            .as_ref()
            .unwrap()
            .starts_with("Start the service")
    );
    let waiting = runtime_checks(None, ServiceState::Running);
    assert!(
        waiting[0]
            .hint
            .as_ref()
            .unwrap()
            .contains("within 30 seconds")
    );

    let healthy = RuntimeState {
        last_contact_at: Some(990),
        ..RuntimeState::default()
    }
    .summary(1_000);
    assert!(
        runtime_checks(Some(&healthy), ServiceState::Running)
            .iter()
            .all(|check| check.outcome == Outcome::Pass)
    );

    let troubled = RuntimeState {
        last_contact_at: Some(100),
        pending_snapshots: 12,
        last_error: Some("trigger poll failed".to_owned()),
        last_error_at: Some(990),
        ..RuntimeState::default()
    }
    .summary(1_000);
    let checks = runtime_checks(Some(&troubled), ServiceState::Running);
    assert_eq!(
        checks.iter().map(|check| check.outcome).collect::<Vec<_>>(),
        [Outcome::Warn, Outcome::Warn, Outcome::Fail]
    );
    assert_eq!(checks[0].detail, "Last contact 15 minutes ago");
    assert_eq!(checks[1].detail, "12 snapshots waiting");
    assert_eq!(checks[2].detail, "trigger poll failed (10 seconds ago)");
}

#[test]
fn report_lists_each_check_with_a_summary() {
    let report = DoctorReport {
        healthy: false,
        checks: vec![
            transport_check("https://mimorii.app/api"),
            service_check(ServiceState::Stopped),
        ],
    };
    let rendered = plain(&render(&report));
    assert!(rendered.starts_with("Mimorii Agent diagnostics\n\n"));
    assert!(rendered.contains("  ✓ Encryption  HTTPS"));
    assert!(rendered.contains("  ✗ Service     Stopped"));
    assert!(rendered.ends_with("  ✗ 1 problem found"));

    let json = serde_json::to_value(&report).unwrap();
    assert_eq!(json["healthy"], false);
    assert_eq!(json["checks"][1]["outcome"], "fail");
    assert_eq!(json["checks"][1]["id"], "service");
}
