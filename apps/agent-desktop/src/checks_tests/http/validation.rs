use std::thread;
use std::time::Duration;

use serde_json::json;

use super::http_task;
use crate::checks::tests::{assert_result, snapshot};
use crate::models::{CheckState, CheckType};
use crate::test_support::{MockResponse, http_server, tcp_listener};

#[test]
fn http_check_rejects_missing_and_invalid_expected_statuses() {
    let missing = crate::checks::tests::execute(
        &crate::checks::tests::task(CheckType::Http, json!({})),
        &snapshot(),
    );
    assert_result(
        &missing,
        CheckState::Down,
        Some("HTTP configuration is invalid"),
        None,
    );

    for statuses in [json!([]), json!((100..121).collect::<Vec<_>>())] {
        let server = http_server(Vec::new());
        let result = crate::checks::tests::execute(
            &http_task(&server.url, json!({ "expectedStatuses": statuses })),
            &snapshot(),
        );
        assert_result(
            &result,
            CheckState::Down,
            Some("HTTP expected status configuration is invalid"),
            None,
        );
    }
}

#[test]
fn http_check_validates_urls_credentials_and_methods() {
    let malformed = http_task("not a url", json!({}));
    assert!(crate::checks::tests::http(&malformed).is_err());

    let protocol = http_task("file:///tmp/health", json!({}));
    assert_eq!(
        crate::checks::tests::http(&protocol)
            .unwrap_err()
            .to_string(),
        "HTTP URL is invalid"
    );

    let credentials = http_task("http://user:password@localhost/health", json!({}));
    let credentials_result = crate::checks::tests::execute(&credentials, &snapshot());
    assert_result(
        &credentials_result,
        CheckState::Down,
        Some("HTTP URL credentials are not allowed"),
        None,
    );

    let method_server = http_server(Vec::new());
    let method = http_task(&method_server.url, json!({ "method": "POST" }));
    let method_result = crate::checks::tests::execute(&method, &snapshot());
    assert_result(
        &method_result,
        CheckState::Down,
        Some("HTTP method is not allowed"),
        None,
    );
}

#[test]
fn http_check_reports_connection_failures_and_timeouts() {
    let (listener, port) = tcp_listener();
    let closed_connection = thread::spawn(move || drop(listener.accept().unwrap()));
    let connection = crate::checks::tests::execute(
        &http_task(&format!("http://127.0.0.1:{port}"), json!({})),
        &snapshot(),
    );
    closed_connection.join().unwrap();
    assert_result(
        &connection,
        CheckState::Down,
        Some("Connection failed"),
        None,
    );

    let timeout_server = http_server(vec![
        MockResponse::new(200, "late").delayed(Duration::from_millis(150)),
    ]);
    let mut timeout_task = http_task(&timeout_server.url, json!({}));
    timeout_task.timeout_ms = 25;
    let timeout = crate::checks::tests::execute(&timeout_task, &snapshot());
    assert_result(&timeout, CheckState::Down, Some("Check timed out"), None);
}

#[test]
fn certificate_warning_configuration_has_no_effect_without_tls() {
    let server = http_server(vec![MockResponse::new(200, "healthy")]);
    let result = crate::checks::tests::execute(
        &http_task(&server.url, json!({ "certificateWarningDays": 30 })),
        &snapshot(),
    );
    assert_result(&result, CheckState::Up, None, Some(200));
    assert!(!result.metrics.contains_key("certificateDaysRemaining"));
}
