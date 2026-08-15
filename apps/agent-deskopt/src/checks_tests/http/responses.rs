use std::time::Duration;

use serde_json::json;

use super::http_task;
use crate::checks::tests::{assert_result, snapshot};
use crate::models::CheckState;
use crate::test_support::{MockResponse, http_server};

#[test]
fn http_check_exercises_assertions_and_collects_response_metrics() {
    let server = http_server(vec![
        MockResponse::new(200, r#"{"service":{"state":"ready"}}"#)
            .header("Content-Type", "application/json; charset=utf-8")
            .header("Server", "mimorii-fixture")
            .header("X-Powered-By", "Rust")
            .header("X-Fixture-State", "ready"),
    ]);
    let result = crate::checks::tests::execute(
        &http_task(
            &format!("{}/health", server.url),
            json!({
                "responseContains": "service",
                "expectedHeaders": {
                    "content-type": "application/json",
                    "x-fixture-state": "ready"
                },
                "jsonPointer": "/service/state",
                "expectedJsonValue": "ready"
            }),
        ),
        &snapshot(),
    );

    assert_result(&result, CheckState::Up, None, Some(200));
    assert!(result.latency_ms.is_some());
    assert_eq!(result.metrics["responseBytes"], 29);
    assert_eq!(result.metrics["server"], "mimorii-fixture");
    assert_eq!(result.metrics["poweredBy"], "Rust");
    assert_eq!(
        result.metrics["contentType"],
        "application/json; charset=utf-8"
    );
    let request = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    assert!(request.starts_with("GET /health HTTP/1.1"));
    assert!(request.contains(&format!(
        "user-agent: mimorii-agent-deskopt/{}",
        env!("CARGO_PKG_VERSION")
    )));
}

#[test]
fn http_head_requests_and_expected_statuses_are_supported() {
    let server = http_server(vec![MockResponse::new(204, "")]);
    let result = crate::checks::tests::execute(
        &http_task(
            &format!("{}/head", server.url),
            json!({ "method": "HEAD", "expectedStatuses": [200, 204] }),
        ),
        &snapshot(),
    );

    assert_result(&result, CheckState::Up, None, Some(204));
    let request = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    assert!(request.starts_with("HEAD /head HTTP/1.1"));
}

#[test]
fn http_check_reports_unexpected_status_content_and_headers() {
    let status_server = http_server(vec![MockResponse::new(500, "failure")]);
    let status =
        crate::checks::tests::execute(&http_task(&status_server.url, json!({})), &snapshot());
    assert_result(
        &status,
        CheckState::Down,
        Some("Unexpected HTTP status"),
        Some(500),
    );

    let content_server = http_server(vec![MockResponse::new(200, "healthy")]);
    let content = crate::checks::tests::execute(
        &http_task(&content_server.url, json!({ "responseContains": "ready" })),
        &snapshot(),
    );
    assert_result(
        &content,
        CheckState::Down,
        Some("Expected response content was not found"),
        Some(200),
    );

    let header_server = http_server(vec![MockResponse::new(200, "healthy")]);
    let header = crate::checks::tests::execute(
        &http_task(
            &header_server.url,
            json!({ "expectedHeaders": { "x-service": "ready" } }),
        ),
        &snapshot(),
    );
    assert_result(
        &header,
        CheckState::Down,
        Some("Expected response header x-service was not found"),
        Some(200),
    );
}

#[test]
fn http_json_assertions_report_each_failure_path() {
    let invalid_server = http_server(vec![MockResponse::new(200, "not-json")]);
    let invalid = crate::checks::tests::execute(
        &http_task(&invalid_server.url, json!({ "jsonPointer": "/state" })),
        &snapshot(),
    );
    assert_result(
        &invalid,
        CheckState::Down,
        Some("Response is not valid JSON"),
        Some(200),
    );

    let missing_server = http_server(vec![MockResponse::new(200, r#"{"state":"ready"}"#)]);
    let missing = crate::checks::tests::execute(
        &http_task(
            &missing_server.url,
            json!({ "jsonPointer": "/service/state" }),
        ),
        &snapshot(),
    );
    assert_result(
        &missing,
        CheckState::Down,
        Some("Expected JSON value was not found"),
        Some(200),
    );

    let mismatch_server = http_server(vec![MockResponse::new(200, r#"{"state":"ready"}"#)]);
    let mismatch = crate::checks::tests::execute(
        &http_task(
            &mismatch_server.url,
            json!({ "jsonPointer": "/state", "expectedJsonValue": "down" }),
        ),
        &snapshot(),
    );
    assert_result(
        &mismatch,
        CheckState::Down,
        Some("JSON value did not match"),
        Some(200),
    );
}

#[test]
fn http_json_pointer_without_an_expected_value_only_checks_presence() {
    let server = http_server(vec![MockResponse::new(200, r#"{"state":{"value":1}}"#)]);
    let result = crate::checks::tests::execute(
        &http_task(&server.url, json!({ "jsonPointer": "/state" })),
        &snapshot(),
    );
    assert_result(&result, CheckState::Up, None, Some(200));
}

#[test]
fn http_latency_threshold_reports_degraded() {
    let server = http_server(vec![
        MockResponse::new(200, "healthy").delayed(Duration::from_millis(25)),
    ]);
    let result = crate::checks::tests::execute(
        &http_task(&server.url, json!({ "latencyWarningMs": 1.0 })),
        &snapshot(),
    );
    assert_result(
        &result,
        CheckState::Degraded,
        Some("Response latency exceeded the warning threshold"),
        Some(200),
    );
}

#[test]
fn http_response_bodies_are_bounded() {
    let server = http_server(vec![MockResponse::new(200, "x".repeat(600 * 1024))]);
    let result = crate::checks::tests::execute(&http_task(&server.url, json!({})), &snapshot());
    assert_result(&result, CheckState::Up, None, Some(200));
    assert_eq!(result.metrics["responseBytes"], 512 * 1024);
}

#[test]
fn http_check_follows_relative_redirects_when_enabled() {
    let server = http_server(vec![
        MockResponse::new(302, "").header("Location", "/final"),
        MockResponse::new(200, "ready"),
    ]);
    let result = crate::checks::tests::execute(
        &http_task(
            &format!("{}/start", server.url),
            json!({ "followRedirects": true }),
        ),
        &snapshot(),
    );

    assert_result(&result, CheckState::Up, None, Some(200));
    let first = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    let second = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    assert!(first.starts_with("GET /start HTTP/1.1"));
    assert!(second.starts_with("GET /final HTTP/1.1"));
}

#[test]
fn http_check_can_observe_redirects_without_following_them() {
    let server = http_server(vec![
        MockResponse::new(302, "redirect").header("Location", "/final"),
    ]);
    let result = crate::checks::tests::execute(
        &http_task(&server.url, json!({ "expectedStatuses": [302] })),
        &snapshot(),
    );
    assert_result(&result, CheckState::Up, None, Some(302));
    assert!(server.requests.recv_timeout(Duration::from_secs(1)).is_ok());
    assert!(server.requests.try_recv().is_err());
}

#[test]
fn http_redirect_failures_are_reported() {
    let redirects = (0..4)
        .map(|_| MockResponse::new(302, "").header("Location", "/again"))
        .collect();
    let loop_server = http_server(redirects);
    let loop_result = crate::checks::tests::execute(
        &http_task(&loop_server.url, json!({ "followRedirects": true })),
        &snapshot(),
    );
    assert_result(
        &loop_result,
        CheckState::Down,
        Some("Too many redirects"),
        Some(302),
    );

    let missing_server = http_server(vec![MockResponse::new(302, "")]);
    let missing = crate::checks::tests::execute(
        &http_task(&missing_server.url, json!({ "followRedirects": true })),
        &snapshot(),
    );
    assert_result(&missing, CheckState::Down, Some("Connection failed"), None);

    let protocol_server = http_server(vec![
        MockResponse::new(302, "").header("Location", "file:///secret"),
    ]);
    let protocol = crate::checks::tests::execute(
        &http_task(&protocol_server.url, json!({ "followRedirects": true })),
        &snapshot(),
    );
    assert_result(
        &protocol,
        CheckState::Down,
        Some("redirect protocol is not allowed"),
        None,
    );
}
