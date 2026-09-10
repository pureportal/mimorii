use std::io::{Read, Write};
use std::net::{Ipv4Addr, Ipv6Addr, TcpListener, TcpStream};
use std::str::FromStr;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::anyhow;
use hickory_resolver::config::{NameServerConfig, Protocol, ResolverConfig};
use hickory_resolver::proto::op::{Message, MessageType};
use hickory_resolver::proto::rr::rdata::{A, AAAA, CNAME, MX, NS, SRV, TXT};
use hickory_resolver::proto::rr::{Name, RData, Record, RecordType};
use serde_json::json;

use super::{assert_result, snapshot, task};
use crate::models::{CheckState, CheckType};
use crate::target_policy::{TargetPolicy, TargetProtocol};
use crate::test_support::tcp_listener;

#[test]
fn tcp_check_connects_and_records_the_port() {
    let (listener, port) = tcp_listener();
    let handle = thread::spawn(move || listener.accept().unwrap());
    let result = super::execute(
        &task(
            CheckType::Tcp,
            json!({ "target": { "host": "127.0.0.1", "port": port } }),
        ),
        &snapshot(),
    );

    assert_result(&result, CheckState::Up, None, None);
    assert_eq!(result.metrics["port"], port);
    assert!(result.latency_ms.is_some());
    handle.join().unwrap();
}

#[test]
fn tcp_check_reports_connection_and_configuration_failures() {
    let (listener, port) = tcp_listener();
    drop(listener);
    let connection = super::execute(
        &task(
            CheckType::Tcp,
            json!({ "target": { "host": "127.0.0.1", "port": port } }),
        ),
        &snapshot(),
    );
    assert_result(
        &connection,
        CheckState::Down,
        Some("Connection failed"),
        None,
    );
    assert!(connection.latency_ms.is_some());

    let invalid = super::execute(&task(CheckType::Tcp, json!({})), &snapshot());
    assert_result(
        &invalid,
        CheckState::Down,
        Some("TCP configuration is invalid"),
        None,
    );
}

#[test]
fn tcp_latency_threshold_reports_up_and_degraded() {
    let up = super::super::tcp_success("task-1", 443, Some(749.9), 1_000);
    assert_result(&up, CheckState::Up, None, None);

    let degraded = super::super::tcp_success("task-1", 443, Some(750.0), 1_000);
    assert_result(
        &degraded,
        CheckState::Degraded,
        Some("Connection is near the timeout"),
        None,
    );
}

#[test]
fn dns_check_supports_every_configured_record_type() {
    for (record_type, expected) in [
        (RecordType::A, "192.0.2.10"),
        (RecordType::AAAA, "2001:db8::10"),
        (RecordType::CNAME, "target.relay.test."),
        (RecordType::MX, "mail.relay.test."),
        (RecordType::NS, "ns.relay.test."),
        (RecordType::SRV, "service.relay.test."),
        (RecordType::TXT, "mimorii-relay"),
    ] {
        let (resolver, server) = dns_fixture(record_type);
        let result = super::super::dns_with_config(
            &task(
                CheckType::Dns,
                json!({
                    "target": { "hostname": "relay.test." },
                    "recordType": record_type.to_string(),
                    "expectedValue": expected
                }),
            ),
            resolver,
        );
        server.join().unwrap();
        let result = result.unwrap();
        assert_result(&result, CheckState::Up, None, None);
        assert_eq!(result.metrics["recordCount"], 1);
    }
}

#[test]
fn dns_check_reports_expected_value_mismatches() {
    let (resolver, server) = dns_fixture(RecordType::A);
    let result = super::super::dns_with_config(
        &task(
            CheckType::Dns,
            json!({
                "target": { "hostname": "relay.test." },
                "recordType": "A",
                "expectedValue": "198.51.100.5"
            }),
        ),
        resolver,
    );
    server.join().unwrap();
    let result = result.unwrap();

    assert_result(
        &result,
        CheckState::Down,
        Some("Expected DNS value was not found"),
        None,
    );
    assert_eq!(result.metrics["recordCount"], 1);
}

#[test]
fn dns_check_rejects_invalid_configuration_and_record_types() {
    let malformed = super::execute(&task(CheckType::Dns, json!({})), &snapshot());
    assert_result(
        &malformed,
        CheckState::Down,
        Some("DNS configuration is invalid"),
        None,
    );

    let invalid_type = super::execute(
        &task(
            CheckType::Dns,
            json!({ "target": { "hostname": "relay.test" }, "recordType": "INVALID" }),
        ),
        &snapshot(),
    );
    assert_result(
        &invalid_type,
        CheckState::Down,
        Some("DNS record type is invalid"),
        None,
    );
}

#[test]
fn dns_timeout_errors_are_reported() {
    let (resolver, listener) = dns_listener();
    listener.set_nonblocking(true).unwrap();
    let mut value = task(
        CheckType::Dns,
        json!({ "target": { "hostname": "relay.test." }, "recordType": "A" }),
    );
    value.timeout_ms = 100;
    let error = super::super::dns_with_config(&value, resolver).unwrap_err();

    let (mut stream, _) = listener.accept().unwrap();
    stream.set_nonblocking(false).unwrap();
    let request = read_dns_request(&mut stream);
    assert_eq!(request.queries()[0].query_type(), RecordType::A);
    assert_eq!(request.queries()[0].name().to_string(), "relay.test.");
    assert_eq!(super::super::safe_error(&error), "Check timed out");
}

#[test]
fn safe_errors_are_reduced_to_supported_messages() {
    for (message, expected) in [
        ("operation timed out", "Check timed out"),
        ("timeout while connecting", "Check timed out"),
        ("DNS lookup failed", "DNS lookup failed"),
        ("could not resolve target", "could not resolve target"),
        ("certificate expired", "TLS validation failed"),
        ("TLS handshake failed", "TLS validation failed"),
        ("configuration is invalid", "configuration is invalid"),
        ("method is not allowed", "method is not allowed"),
        ("socket refused", "Connection failed"),
    ] {
        assert_eq!(super::super::safe_error(&anyhow!(message)), expected);
    }
    let resolution = anyhow!("local resolver returned NXDOMAIN")
        .context("DNS lookup failed for private-service.internal");
    assert_eq!(
        super::super::safe_error(&resolution),
        "DNS lookup failed for private-service.internal: local resolver returned NXDOMAIN"
    );
}

#[test]
fn result_helpers_preserve_fields_and_measure_elapsed_time() {
    let result = super::super::down(
        "task-1",
        "Unavailable",
        Some(2.5),
        Some(503),
        std::collections::BTreeMap::from([("attempts".to_owned(), json!(1))]),
    );
    assert_result(&result, CheckState::Down, Some("Unavailable"), Some(503));
    assert_eq!(result.latency_ms, Some(2.5));
    assert_eq!(result.metrics["attempts"], 1);

    let elapsed = super::super::elapsed_ms(Instant::now()).unwrap();
    assert!(elapsed >= 0.0);
}

#[test]
fn icmp_wan_and_database_checks_enforce_the_agent_target_policy() {
    let policy = TargetPolicy {
        allowed_protocols: vec![TargetProtocol::Http],
        ..TargetPolicy::default()
    };
    let definitions = [
        (
            CheckType::Icmp,
            json!({
                "target": { "host": "example.com" },
                "packetCount": 2,
                "minimumSuccessPercent": 100
            }),
        ),
        (
            CheckType::Wan,
            json!({
                "targets": [{ "name": "Primary", "host": "example.com" }],
                "requiredSuccessfulTargets": 1,
                "packetCount": 2
            }),
        ),
        (
            CheckType::Database,
            json!({
                "target": {
                    "engine": "postgresql",
                    "host": "database.example.com",
                    "port": 5432,
                    "database": "app",
                    "username": "monitor",
                    "tls": true
                },
                "connectionWarningPercent": 85
            }),
        ),
    ];
    for (check_type, config) in definitions {
        let result = super::super::execute(&task(check_type, config), &snapshot(), &policy);
        assert_result(
            &result,
            CheckState::Down,
            Some("Target is not allowed by agent policy"),
            None,
        );
    }
}

fn dns_fixture(record_type: RecordType) -> (ResolverConfig, thread::JoinHandle<()>) {
    let (resolver, listener) = dns_listener();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let request = read_dns_request(&mut stream);
        let query = request.queries()[0].clone();
        assert_eq!(query.query_type(), record_type);
        let mut response = Message::new();
        response
            .set_id(request.id())
            .set_message_type(MessageType::Response)
            .set_authoritative(true)
            .set_recursion_available(true)
            .add_query(query.clone())
            .add_answer(Record::from_rdata(
                query.name().clone(),
                60,
                fixture_rdata(record_type),
            ));
        let payload = response.to_vec().unwrap();
        let length = u16::try_from(payload.len()).unwrap().to_be_bytes();
        stream.write_all(&length).unwrap();
        stream.write_all(&payload).unwrap();
    });
    (resolver, server)
}

fn dns_listener() -> (ResolverConfig, TcpListener) {
    let (listener, _) = tcp_listener();
    let address = listener.local_addr().unwrap();
    (
        ResolverConfig::from_parts(
            None,
            Vec::new(),
            vec![NameServerConfig::new(address, Protocol::Tcp)],
        ),
        listener,
    )
}

fn read_dns_request(stream: &mut TcpStream) -> Message {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let mut length = [0_u8; 2];
    stream.read_exact(&mut length).unwrap();
    let mut payload = vec![0_u8; usize::from(u16::from_be_bytes(length))];
    stream.read_exact(&mut payload).unwrap();
    Message::from_vec(&payload).unwrap()
}

fn fixture_rdata(record_type: RecordType) -> RData {
    match record_type {
        RecordType::A => RData::A(A(Ipv4Addr::new(192, 0, 2, 10))),
        RecordType::AAAA => RData::AAAA(AAAA(Ipv6Addr::from_str("2001:db8::10").unwrap())),
        RecordType::CNAME => RData::CNAME(CNAME(Name::from_str("target.relay.test.").unwrap())),
        RecordType::MX => RData::MX(MX::new(10, Name::from_str("mail.relay.test.").unwrap())),
        RecordType::NS => RData::NS(NS(Name::from_str("ns.relay.test.").unwrap())),
        RecordType::SRV => RData::SRV(SRV::new(
            10,
            5,
            443,
            Name::from_str("service.relay.test.").unwrap(),
        )),
        RecordType::TXT => RData::TXT(TXT::new(vec!["mimorii-relay".to_owned()])),
        _ => unreachable!(),
    }
}
