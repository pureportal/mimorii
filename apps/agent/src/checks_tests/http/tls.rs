use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Arc;
use std::thread;

use rcgen::{CertificateParams, DistinguishedName, DnType, KeyPair};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::{ServerConfig, ServerConnection, StreamOwned};
use serde_json::json;
use time::{Duration, OffsetDateTime};

use super::http_task;
use crate::checks::tests::{assert_result, snapshot};
use crate::models::CheckState;

struct CertificateFixture {
    certificate: CertificateDer<'static>,
    private_key: PrivateKeyDer<'static>,
}

struct TlsServer {
    url: String,
    certificate: CertificateDer<'static>,
}

#[test]
fn certificate_inspection_rejects_invalid_der() {
    let error = crate::checks::certificate_metrics(b"not a certificate").unwrap_err();
    assert_eq!(error.to_string(), "TLS certificate could not be inspected");
}

#[test]
fn certificate_inspection_reports_expiration_and_issuer() {
    let fixture = certificate(OffsetDateTime::now_utc() + Duration::days(45));
    let metrics = crate::checks::certificate_metrics(fixture.certificate.as_ref()).unwrap();

    assert!(metrics.expires_at.contains('T'));
    assert!((43..=45).contains(&metrics.days_remaining));
    assert!(metrics.issuer.contains("Mimorii relay test"));
}

#[test]
fn https_check_collects_certificate_metrics() {
    let server = tls_server(OffsetDateTime::now_utc() + Duration::days(90));
    let result = crate::checks::execute(
        &http_task(&server.url, json!({ "validateTls": false })),
        &snapshot(),
    );

    assert_result(&result, CheckState::Up, None, Some(200));
    assert!(
        result.metrics["certificateExpiresAt"]
            .as_str()
            .unwrap()
            .contains('T')
    );
    assert!(result.metrics["certificateDaysRemaining"].as_i64().unwrap() >= 88);
    assert!(
        result.metrics["certificateIssuer"]
            .as_str()
            .unwrap()
            .contains("Mimorii relay test")
    );
    assert_eq!(result.metrics["contentType"], "text/plain");
    assert!(!server.certificate.is_empty());
}

#[test]
fn https_check_reports_certificate_warning_and_expiration_states() {
    let warning_server = tls_server(OffsetDateTime::now_utc() + Duration::days(10));
    let warning = crate::checks::execute(
        &http_task(
            &warning_server.url,
            json!({ "validateTls": false, "certificateWarningDays": 30 }),
        ),
        &snapshot(),
    );
    assert_result(
        &warning,
        CheckState::Degraded,
        Some("TLS certificate is nearing expiration"),
        Some(200),
    );

    let expired_server = tls_server(OffsetDateTime::now_utc() - Duration::days(1));
    let expired = crate::checks::execute(
        &http_task(
            &expired_server.url,
            json!({ "validateTls": false, "certificateWarningDays": 30 }),
        ),
        &snapshot(),
    );
    assert_result(
        &expired,
        CheckState::Down,
        Some("TLS certificate has expired"),
        Some(200),
    );
}

#[test]
fn https_check_enforces_tls_validation() {
    let server = tls_server(OffsetDateTime::now_utc() + Duration::days(90));
    let result = crate::checks::execute(&http_task(&server.url, json!({})), &snapshot());
    assert_result(
        &result,
        CheckState::Down,
        Some("TLS validation failed"),
        None,
    );
}

fn tls_server(not_after: OffsetDateTime) -> TlsServer {
    let fixture = certificate(not_after);
    let certificate = fixture.certificate.clone();
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = ServerConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(vec![fixture.certificate], fixture.private_key)
        .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    thread::spawn(move || {
        let Ok((socket, _)) = listener.accept() else {
            return;
        };
        let Ok(connection) = ServerConnection::new(Arc::new(config)) else {
            return;
        };
        let mut stream = StreamOwned::new(connection, socket);
        let mut request = [0_u8; 4096];
        if stream.read(&mut request).is_err() {
            return;
        }
        let body = "secure";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
    });
    TlsServer {
        url: format!("https://localhost:{}/health", address.port()),
        certificate,
    }
}

fn certificate(not_after: OffsetDateTime) -> CertificateFixture {
    let mut parameters = CertificateParams::new(vec!["localhost".to_owned()]).unwrap();
    parameters.not_before = OffsetDateTime::now_utc() - Duration::days(30);
    parameters.not_after = not_after;
    parameters.distinguished_name = DistinguishedName::new();
    parameters
        .distinguished_name
        .push(DnType::CommonName, "Mimorii relay test");
    let signing_key = KeyPair::generate().unwrap();
    let certificate = parameters.self_signed(&signing_key).unwrap();
    CertificateFixture {
        certificate: certificate.der().clone(),
        private_key: PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(signing_key.serialize_der())),
    }
}
