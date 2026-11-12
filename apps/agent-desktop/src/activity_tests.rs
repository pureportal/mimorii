use std::collections::BTreeMap;

use serde_json::json;

use super::{CheckActivity, describe_target, record, render};
use crate::models::{AgentTask, CheckState, CheckType, TaskResult};
use crate::test_support::plain;

fn task(check_type: CheckType, config: serde_json::Value) -> AgentTask {
    serde_json::from_value(json!({
        "id": "task-1",
        "checkId": "check-1",
        "type": check_type,
        "timeoutMs": 5000,
        "config": config,
        "secret": "never-recorded",
        "faviconRequestId": null,
        "issuedAt": "2026-11-12T10:00:00Z"
    }))
    .unwrap()
}

fn result(status: CheckState, latency_ms: Option<f64>, message: Option<&str>) -> TaskResult {
    TaskResult {
        task_id: "task-1".to_owned(),
        status,
        latency_ms,
        status_code: None,
        message: message.map(str::to_owned),
        metrics: BTreeMap::new(),
        checked_at: "2026-11-12T10:00:01Z".to_owned(),
        favicon: None,
    }
}

#[test]
fn targets_are_described_without_credentials_or_query_strings() {
    assert_eq!(
        describe_target(
            CheckType::Http,
            &json!({"target": {"url": "https://user:secret@intranet.example:8443/health?token=abc#top"}})
        ),
        "https://intranet.example:8443/health"
    );
    assert_eq!(
        describe_target(
            CheckType::Http,
            &json!({"target": {"url": "https://status.example/"}})
        ),
        "https://status.example"
    );
    assert_eq!(
        describe_target(CheckType::Http, &json!({"target": {"url": "not a url"}})),
        "HTTP endpoint"
    );
    assert_eq!(
        describe_target(
            CheckType::Tcp,
            &json!({"target": {"host": "db.internal", "port": 5432}})
        ),
        "db.internal:5432"
    );
    assert_eq!(
        describe_target(
            CheckType::Tcp,
            &json!({"target": {"host": "fd00::5", "port": 22}})
        ),
        "[fd00::5]:22"
    );
    assert_eq!(
        describe_target(
            CheckType::Dns,
            &json!({"target": {"hostname": "example.com"}, "recordType": "aaaa"})
        ),
        "example.com AAAA"
    );
    assert_eq!(
        describe_target(
            CheckType::Wan,
            &json!({"targets": [{"name": "Cloudflare", "host": "1.1.1.1"}, {"name": "Quad9", "host": "9.9.9.9"}]})
        ),
        "Cloudflare, Quad9"
    );
    assert_eq!(
        describe_target(
            CheckType::Database,
            &json!({"target": {"engine": "postgresql", "host": "10.0.0.4", "port": 5432}})
        ),
        "postgresql 10.0.0.4:5432"
    );
    assert_eq!(
        describe_target(CheckType::Host, &json!({})),
        "This computer"
    );
    assert_eq!(
        describe_target(CheckType::Disk, &json!({"mount": "C:"})),
        "C:"
    );
    assert_eq!(
        describe_target(CheckType::Docker, &json!({})),
        "All containers"
    );
    assert_eq!(describe_target(CheckType::Icmp, &json!({})), "Ping");
}

#[test]
fn records_results_without_task_secrets() {
    let tasks = [task(
        CheckType::Tcp,
        json!({"target": {"host": "db.internal", "port": 5432}}),
    )];
    let long_message = "x".repeat(400);
    let checks = record(
        &tasks,
        &[result(CheckState::Down, None, Some(&long_message))],
    );
    assert_eq!(checks.len(), 1);
    assert_eq!(checks[0].target, "db.internal:5432");
    assert_eq!(checks[0].status, CheckState::Down);
    assert_eq!(checks[0].message.as_ref().unwrap().len(), 300);
    assert!(
        !serde_json::to_string(&checks)
            .unwrap()
            .contains("never-recorded")
    );
}

#[test]
fn renders_recent_checks_as_an_aligned_table() {
    let views = [
        CheckActivity {
            checked_at: 1_000,
            check_type: CheckType::Http,
            target: "https://intranet.example/health".to_owned(),
            status: CheckState::Up,
            latency_ms: Some(42.4),
            message: None,
        },
        CheckActivity {
            checked_at: 1_000,
            check_type: CheckType::Tcp,
            target: "db.internal:5432".to_owned(),
            status: CheckState::Down,
            latency_ms: None,
            message: Some("connection refused".to_owned()),
        },
    ]
    .map(|check| check.view(1_090));
    let rendered = plain(&render(&views));
    assert!(rendered.starts_with("Recent checks 2 checks\n\n"));
    assert!(
        rendered.contains(
            "  1 minute ago  ✓ Up        HTTP      https://intranet.example/health  42 ms"
        )
    );
    assert!(rendered.contains(
        "  1 minute ago  ✗ Down      TCP       db.internal:5432                 connection refused"
    ));
    assert!(plain(&render(&[])).contains("No checks have run on this computer yet."));
}
