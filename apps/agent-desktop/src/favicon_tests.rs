use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use crate::target_policy::TargetPolicy;
use crate::test_support::{MockResponse, http_server};

use super::formats::looks_like_image;

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

#[test]
fn retrieves_a_commented_svg_without_relying_on_its_content_type() {
    let svg = "<!-- Website icon -->\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\"/></svg>";
    let server = http_server(vec![
        MockResponse::new(
            200,
            r#"<head>
              <base href="/assets/">
              <link rel="icon" href="small.png" sizes="32x32">
              <link rel="icon" type="image/svg+xml" href="icon?v=2" sizes="any">
            </head>"#,
        )
        .header("Content-Type", "text/html"),
        MockResponse::new(200, svg).header("Content-Type", "application/octet-stream"),
    ]);

    let image = super::retrieve(&server.url, 2_000, &TargetPolicy::default()).unwrap();

    assert_eq!(image, svg.as_bytes());
    server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    let image_request = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    assert!(image_request.starts_with("GET /assets/icon?v=2 HTTP/1.1"));
}

#[test]
fn recognizes_existing_raster_favicon_signatures() {
    for body in [
        b"\x89PNG\r\n\x1a\n".as_slice(),
        b"\xff\xd8\xff",
        b"GIF87a",
        b"GIF89a",
        b"RIFF\x00\x00\x00\x00WEBP",
        b"\x00\x00\x01\x00",
    ] {
        assert!(looks_like_image(body, None));
        assert!(looks_like_image(body, Some("application/octet-stream")));
    }
}

#[test]
fn recognizes_svg_prologues() {
    for prefix in [
        "",
        "\u{feff}\n ",
        "<?xml version=\"1.0\"?>\n",
        "<!-- Website icon -->\n",
        "<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n",
    ] {
        let svg =
            format!("{prefix}<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"/>");
        assert!(looks_like_image(svg.as_bytes(), None));
        assert!(looks_like_image(svg.as_bytes(), Some("text/plain")));
    }
}

#[test]
fn recognizes_avif_major_and_compatible_brands() {
    for body in [
        b"\x00\x00\x00\x18ftypavif\x00\x00\x00\x00avifmif1".as_slice(),
        b"\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00miafavif",
        b"\x00\x00\x00\x18ftypavis\x00\x00\x00\x00avismsf1",
    ] {
        assert!(looks_like_image(body, None));
        assert!(looks_like_image(body, Some("application/octet-stream")));
    }
}

#[test]
fn rejects_other_containers_and_invalid_image_bodies() {
    for body in [
        b"".as_slice(),
        b"<html>error</html>",
        b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00heicmif1",
        b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isommp42",
        b"\x00\x00\x00\x18ftypavif",
        b"\x00\x00\x00\x08ftypavif\x00\x00\x00\x00avifmif1",
        b"\xff\xff\xff\xffftypavif\x00\x00\x00\x00avifmif1",
        b"\x00\x00\x00\x18ftypmif1avifmiafmif1",
        b"RIFF\x00\x00\x00\x00WAVE",
    ] {
        assert!(!looks_like_image(body, Some("image/avif")));
        assert!(!looks_like_image(body, Some("image/svg+xml")));
    }
}
