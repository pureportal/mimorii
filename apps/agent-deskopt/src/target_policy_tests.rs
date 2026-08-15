use std::net::{IpAddr, SocketAddr};
use std::str::FromStr;

use ipnet::IpNet;

use super::{TargetPolicy, TargetProtocol};

fn address(value: &str) -> SocketAddr {
    SocketAddr::new(IpAddr::from_str(value).unwrap(), 443)
}

fn authorize(
    policy: &TargetPolicy,
    protocol: TargetProtocol,
    hostname: &str,
    port: u16,
    addresses: Vec<SocketAddr>,
) -> anyhow::Result<Vec<SocketAddr>> {
    policy.authorize_request(protocol, hostname, port)?;
    policy.authorize_addresses(addresses)
}

#[test]
fn default_policy_rejects_non_public_and_metadata_addresses() {
    let policy = TargetPolicy::default();
    for value in [
        "0.0.0.0",
        "10.0.0.1",
        "100.100.100.200",
        "127.0.0.1",
        "169.254.169.254",
        "172.16.0.1",
        "192.168.0.1",
        "224.0.0.1",
        "::",
        "::1",
        "::ffff:127.0.0.1",
        "fd00:ec2::254",
        "fe80::1",
        "ff02::1",
    ] {
        assert!(
            authorize(
                &policy,
                TargetProtocol::Https,
                "target.test",
                443,
                vec![address(value)]
            )
            .is_err(),
            "{value} should be rejected"
        );
    }
}

#[test]
fn explicit_cidr_exemptions_allow_private_targets() {
    let policy = TargetPolicy {
        allowed_cidrs: vec![IpNet::from_str("10.20.0.0/16").unwrap()],
        ..TargetPolicy::default()
    };
    assert!(
        authorize(
            &policy,
            TargetProtocol::Tcp,
            "database.internal",
            5432,
            vec![address("10.20.4.8")]
        )
        .is_ok()
    );
    assert!(
        authorize(
            &policy,
            TargetProtocol::Tcp,
            "database.internal",
            5432,
            vec![address("10.21.4.8")]
        )
        .is_err()
    );
}

#[test]
fn policy_restricts_hostnames_protocols_and_ports() {
    let policy = TargetPolicy {
        allowed_hostnames: vec!["*.example.com".to_owned()],
        allowed_protocols: vec![TargetProtocol::Https],
        allowed_ports: vec![443],
        ..TargetPolicy::default()
    };
    let public = vec![address("93.184.216.34")];
    assert!(
        authorize(
            &policy,
            TargetProtocol::Https,
            "status.example.com",
            443,
            public.clone()
        )
        .is_ok()
    );
    for (protocol, hostname, port) in [
        (TargetProtocol::Http, "status.example.com", 443),
        (TargetProtocol::Https, "example.com", 443),
        (TargetProtocol::Https, "status.example.net", 443),
        (TargetProtocol::Https, "status.example.com", 8443),
    ] {
        assert!(authorize(&policy, protocol, hostname, port, public.clone()).is_err());
    }
}

#[test]
fn mixed_dns_answers_are_rejected_as_a_set() {
    let policy = TargetPolicy::default();
    assert!(
        authorize(
            &policy,
            TargetProtocol::Https,
            "mixed.example.com",
            443,
            vec![address("93.184.216.34"), address("127.0.0.1")]
        )
        .is_err()
    );
}

#[test]
fn invalid_hostname_patterns_are_rejected() {
    for pattern in ["", "status.*.com", "*.", "münchen.example"] {
        let policy = TargetPolicy {
            allowed_hostnames: vec![pattern.to_owned()],
            ..TargetPolicy::default()
        };
        assert!(policy.validate().is_err(), "{pattern} should be rejected");
    }
}
