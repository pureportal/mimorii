use std::net::{Ipv4Addr, Ipv6Addr, UdpSocket};
use std::str::FromStr;
use std::sync::Mutex;
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
use crate::target_policy::TargetPolicy;
use crate::test_support::tcp_listener;

static DNS_TEST_LOCK: Mutex<()> = Mutex::new(());

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
    let _guard = DNS_TEST_LOCK.lock().unwrap();
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
    let _guard = DNS_TEST_LOCK.lock().unwrap();
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
        Some("Target could not be resolved"),
        None,
    );
}

#[test]
fn dns_timeout_errors_are_reported() {
    let _guard = DNS_TEST_LOCK.lock().unwrap();
    let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
    socket
        .set_read_timeout(Some(Duration::from_secs(1)))
        .unwrap();
    let address = socket.local_addr().unwrap();
    let server_socket = socket.try_clone().unwrap();
    let server = thread::spawn(move || {
        let mut buffer = [0_u8; 2048];
        server_socket.recv_from(&mut buffer).unwrap();
    });
    let mut value = task(
        CheckType::Dns,
        json!({ "target": { "hostname": "relay.test." }, "recordType": "A" }),
    );
    value.timeout_ms = 100;
    let resolver = ResolverConfig::from_parts(
        None,
        Vec::new(),
        vec![NameServerConfig::new(address, Protocol::Udp)],
    );

    let error = super::super::dns_with_config(&value, resolver).unwrap_err();

    assert_eq!(super::super::safe_error(&error), "Check timed out");
    drop(socket);
    server.join().unwrap();
}

#[test]
fn safe_errors_are_reduced_to_supported_messages() {
    for (message, expected) in [
        ("operation timed out", "Check timed out"),
        ("timeout while connecting", "Check timed out"),
        ("DNS lookup failed", "Target could not be resolved"),
        ("could not resolve target", "Target could not be resolved"),
        ("certificate expired", "TLS validation failed"),
        ("TLS handshake failed", "TLS validation failed"),
        ("configuration is invalid", "configuration is invalid"),
        ("method is not allowed", "method is not allowed"),
        ("socket refused", "Connection failed"),
    ] {
        assert_eq!(super::super::safe_error(&anyhow!(message)), expected);
    }
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
        allowed_protocols: Vec::new(),
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
    let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
    socket
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let address = socket.local_addr().unwrap();
    let server = thread::spawn(move || {
        let mut buffer = [0_u8; 2048];
        let (length, client) = socket.recv_from(&mut buffer).unwrap();
        let request = Message::from_vec(&buffer[..length]).unwrap();
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
        socket.send_to(&payload, client).unwrap();
    });
    (
        ResolverConfig::from_parts(
            None,
            Vec::new(),
            vec![NameServerConfig::new(address, Protocol::Udp)],
        ),
        server,
    )
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
