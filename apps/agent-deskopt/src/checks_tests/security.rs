use std::cell::Cell;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use serde_json::json;

use super::{assert_result, snapshot, task};
use crate::models::{CheckState, CheckType};
use crate::target_policy::{TargetPolicy, TargetProtocol};
use crate::test_support::{MockResponse, http_server};

fn http_task(url: &str, follow_redirects: bool) -> crate::models::AgentTask {
    task(
        CheckType::Http,
        json!({
            "url": url,
            "method": "GET",
            "expectedStatuses": [200],
            "followRedirects": follow_redirects,
            "validateTls": true
        }),
    )
}

fn loopback_policy() -> TargetPolicy {
    TargetPolicy {
        allowed_cidrs: vec!["127.0.0.1/32".parse().unwrap()],
        ..TargetPolicy::default()
    }
}

#[test]
fn http_redirects_are_revalidated_before_the_next_request() {
    let server = http_server(vec![
        MockResponse::new(302, "").header("Location", "http://169.254.169.254/latest/meta-data/"),
    ]);
    let result = super::super::execute(
        &http_task(&server.url, true),
        &snapshot(),
        &loopback_policy(),
    );

    assert_result(
        &result,
        CheckState::Down,
        Some("Target is not allowed by agent policy"),
        None,
    );
    assert_eq!(server.requests.try_iter().count(), 1);
}

#[test]
fn http_rejects_mixed_answers_before_connecting() {
    let task = http_task("http://mixed.example.test/", false);
    let error = super::super::http_with_resolver(&task, &TargetPolicy::default(), |_, port| {
        Ok(vec![
            SocketAddr::new(IpAddr::V4(Ipv4Addr::new(93, 184, 216, 34)), port),
            SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port),
        ])
    })
    .unwrap_err();

    assert_eq!(error.to_string(), "Target is not allowed by agent policy");
}

#[test]
fn http_connects_only_to_the_single_validated_resolution() {
    let server = http_server(vec![MockResponse::new(200, "healthy")]);
    let parsed = url::Url::parse(&server.url).unwrap();
    let url = format!("http://rebinding.example.test:{}/", parsed.port().unwrap());
    let resolutions = Cell::new(0);
    let result =
        super::super::http_with_resolver(&http_task(&url, false), &loopback_policy(), |_, port| {
            resolutions.set(resolutions.get() + 1);
            Ok(vec![SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port)])
        })
        .unwrap();

    assert_result(&result, CheckState::Up, None, Some(200));
    assert_eq!(resolutions.get(), 1);
    assert_eq!(server.requests.try_iter().count(), 1);
}

#[test]
fn tcp_port_policy_is_checked_before_dns_resolution() {
    let policy = TargetPolicy {
        allowed_protocols: vec![TargetProtocol::Tcp],
        allowed_ports: vec![443],
        ..TargetPolicy::default()
    };
    let resolved = Cell::new(false);
    let error = super::super::tcp_with_resolver(
        &task(
            CheckType::Tcp,
            json!({ "host": "database.example.com", "port": 5432 }),
        ),
        &policy,
        |_, _| {
            resolved.set(true);
            Ok(Vec::new())
        },
    )
    .unwrap_err();

    assert_eq!(error.to_string(), "Target is not allowed by agent policy");
    assert!(!resolved.get());
}
