use serde_json::json;

use super::{AgentControlStatus, render};
use crate::activity::CheckActivity;
use crate::models::{CheckState, CheckType};
use crate::runtime_state::RuntimeState;
use crate::service_state::ServiceState;
use crate::target_policy::TargetPolicy;
use crate::test_support::plain;

fn enrolled_status(runtime: Option<RuntimeState>) -> AgentControlStatus {
    AgentControlStatus {
        agent_version: "15.0.0",
        service: ServiceState::Running,
        enrolled: true,
        server_url: Some("https://observe.example.com/api".to_owned()),
        target_policy: Some(TargetPolicy {
            allowed_ports: vec![443, 5432],
            ..TargetPolicy::default()
        }),
        configuration_error: None,
        runtime: runtime.map(|state| state.summary(1_120)),
        #[cfg(windows)]
        log_path: "C:/ProgramData/Mimorii/Agent/agent-desktop.log".to_owned(),
    }
}

fn check(target: &str, status: CheckState) -> CheckActivity {
    CheckActivity {
        checked_at: 1_000,
        check_type: CheckType::Tcp,
        target: target.to_owned(),
        status,
        latency_ms: Some(3.0),
        message: None,
    }
}

#[test]
fn json_status_exposes_the_policy_and_service_without_the_agent_key() {
    let value = serde_json::to_value(enrolled_status(None)).unwrap();
    assert_eq!(value["service"], json!("running"));
    assert_eq!(value["agentVersion"], json!("15.0.0"));
    assert_eq!(value["targetPolicy"]["allowedCidrs"], json!([]));
    assert_eq!(value["targetPolicy"]["allowedPorts"], json!([443, 5432]));
    assert!(value.get("agentKey").is_none());
    assert_eq!(
        serde_json::to_value(ServiceState::NotInstalled).unwrap(),
        json!("not-installed")
    );
}

#[test]
fn renders_an_enrolled_agent_with_its_latest_cycle_and_error() {
    let rendered = plain(&render(&enrolled_status(Some(RuntimeState {
        last_contact_at: Some(1_100),
        last_upload_at: None,
        last_error: Some("trigger poll failed: agent key was rejected".to_owned()),
        last_error_at: Some(1_110),
        pending_snapshots: 3,
        recent_checks: vec![
            check("db.internal:5432", CheckState::Down),
            check("cache.internal:6379", CheckState::Up),
            CheckActivity {
                checked_at: 500,
                ..check("old.internal:22", CheckState::Down)
            },
        ],
        ..RuntimeState::default()
    }))));

    assert!(rendered.starts_with("Mimorii Agent 15.0.0\n\n"));
    for expected in [
        "  Service         ● Running",
        "  Server          https://observe.example.com/api",
        "  Enrollment      ● Enrolled",
        "  Last contact    20 seconds ago",
        "  Last upload     Never",
        "  Upload queue    3 snapshots waiting",
        "  Last checks     2 checks 2 minutes ago · 1 up · 1 down",
        "  Network access  Ports 443, 5432",
        "  ✗ Last error 10 seconds ago\n    trigger poll failed: agent key was rejected",
    ] {
        assert!(
            rendered.contains(expected),
            "missing {expected:?} in\n{rendered}"
        );
    }
}

#[test]
fn renders_next_steps_for_an_agent_that_is_not_enrolled() {
    let rendered = plain(&render(&AgentControlStatus {
        service: ServiceState::NotInstalled,
        enrolled: false,
        server_url: None,
        target_policy: None,
        ..enrolled_status(None)
    }));
    assert!(rendered.contains("  Service     ● Not installed"));
    assert!(rendered.contains("  Enrollment  ● Not enrolled"));
    assert!(rendered.contains(
        "Enroll this computer with mimorii-agent-desktop enroll --server <url> --key <key>"
    ));
    assert!(!rendered.contains("Last contact"));
}

#[test]
fn unencrypted_servers_are_flagged() {
    let rendered = plain(&render(&AgentControlStatus {
        server_url: Some("http://10.0.0.5:4310/api".to_owned()),
        ..enrolled_status(None)
    }));
    assert!(rendered.contains("http://10.0.0.5:4310/api (unencrypted)"));
}
