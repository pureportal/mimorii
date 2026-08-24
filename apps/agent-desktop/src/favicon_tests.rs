use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use crate::target_policy::TargetPolicy;
use crate::test_support::{MockResponse, http_server};

#[test]
fn retrieves_the_largest_declared_favicon_through_agent_local_dns() {
    let server = http_server(vec![
        MockResponse::new(
            200,
            r#"<html><head>
              <link rel="icon" href="/small.svg" sizes="16x16">
              <link rel="icon" href="/large.svg" sizes="128x128">
            </head></html>"#,
        )
        .header("Content-Type", "text/html"),
        MockResponse::new(200, r#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#)
            .header("Content-Type", "image/svg+xml"),
    ]);
    let parsed = url::Url::parse(&server.url).unwrap();
    let port = parsed.port().unwrap();
    let policy = TargetPolicy {
        allowed_cidrs: vec!["127.0.0.1/32".parse().unwrap()],
        ..TargetPolicy::default()
    };

    let image = super::retrieve_with_resolver(
        &format!("http://private-service.internal:{port}/status"),
        2_000,
        &policy,
        |_, requested_port| {
            Ok(vec![SocketAddr::new(
                IpAddr::V4(Ipv4Addr::LOCALHOST),
                requested_port,
            )])
        },
    )
    .unwrap();

    assert!(String::from_utf8(image).unwrap().contains("<svg"));
    let page_request = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    let image_request = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    assert!(page_request.starts_with("GET /status HTTP/1.1"));
    assert!(image_request.starts_with("GET /large.svg HTTP/1.1"));
}

#[test]
fn reports_agent_local_dns_failures() {
    let error = super::retrieve_with_resolver(
        "http://unresolved.internal/",
        2_000,
        &TargetPolicy::default(),
        |hostname, _| anyhow::bail!("DNS lookup failed for {hostname}"),
    )
    .unwrap_err();

    assert_eq!(error.to_string(), "Favicon could not be retrieved");
}
