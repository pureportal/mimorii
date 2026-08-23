use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

use anyhow::{Result, bail};
use ipnet::IpNet;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetProtocol {
    Http,
    Https,
    Tcp,
    Icmp,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TargetPolicy {
    pub allowed_cidrs: Vec<IpNet>,
    pub allowed_hostnames: Vec<String>,
    pub allowed_protocols: Vec<TargetProtocol>,
    pub allowed_ports: Vec<u16>,
}

impl Default for TargetPolicy {
    fn default() -> Self {
        Self {
            allowed_cidrs: Vec::new(),
            allowed_hostnames: vec!["*".to_owned()],
            allowed_protocols: vec![
                TargetProtocol::Http,
                TargetProtocol::Https,
                TargetProtocol::Tcp,
                TargetProtocol::Icmp,
            ],
            allowed_ports: Vec::new(),
        }
    }
}

impl TargetPolicy {
    pub fn validate(&self) -> Result<()> {
        if self.allowed_hostnames.iter().any(|pattern| {
            let wildcard_count = pattern
                .chars()
                .filter(|character| *character == '*')
                .count();
            pattern.is_empty()
                || !pattern.is_ascii()
                || (wildcard_count > 0
                    && !(wildcard_count == 1
                        && (pattern == "*" || (pattern.starts_with("*.") && pattern.len() > 2))))
        }) {
            bail!("target policy contains an invalid hostname pattern");
        }
        if self.allowed_ports.contains(&0) {
            bail!("target policy contains an invalid port");
        }
        Ok(())
    }

    pub fn authorize_request(
        &self,
        protocol: TargetProtocol,
        hostname: &str,
        port: u16,
    ) -> Result<()> {
        if !self.allowed_protocols.contains(&protocol)
            || (!self.allowed_ports.is_empty() && !self.allowed_ports.contains(&port))
            || !self.hostname_allowed(hostname)
        {
            bail!("Target is not allowed by agent policy");
        }
        Ok(())
    }

    pub fn authorize_host(&self, protocol: TargetProtocol, hostname: &str) -> Result<()> {
        if !self.allowed_protocols.contains(&protocol) || !self.hostname_allowed(hostname) {
            bail!("Target is not allowed by agent policy");
        }
        Ok(())
    }

    pub fn authorize_addresses(&self, addresses: Vec<SocketAddr>) -> Result<Vec<SocketAddr>> {
        if addresses.is_empty() {
            bail!("target could not be resolved");
        }
        let mut unique = HashSet::new();
        let addresses = addresses
            .into_iter()
            .filter(|address| unique.insert(*address))
            .collect::<Vec<_>>();
        if addresses
            .iter()
            .any(|address| !self.allows_ip(address.ip()))
        {
            bail!("Target is not allowed by agent policy");
        }
        Ok(addresses)
    }

    fn hostname_allowed(&self, hostname: &str) -> bool {
        let hostname = hostname.trim_end_matches('.').to_ascii_lowercase();
        self.allowed_hostnames.iter().any(|pattern| {
            let pattern = pattern.trim_end_matches('.').to_ascii_lowercase();
            if pattern == "*" {
                return true;
            }
            if let Some(suffix) = pattern.strip_prefix("*.") {
                return hostname.len() > suffix.len()
                    && hostname.ends_with(suffix)
                    && hostname.as_bytes()[hostname.len() - suffix.len() - 1] == b'.';
            }
            hostname == pattern
        })
    }

    fn allows_ip(&self, address: IpAddr) -> bool {
        self.allowed_cidrs
            .iter()
            .any(|network| network.contains(&address))
            || !is_non_public(address)
    }
}

fn is_non_public(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_non_public_v4(address),
        IpAddr::V6(address) => address
            .to_ipv4_mapped()
            .map(is_non_public_v4)
            .unwrap_or_else(|| is_non_public_v6(address)),
    }
}

fn is_non_public_v4(address: Ipv4Addr) -> bool {
    let value = u32::from(address);
    in_v4_network(value, [0, 0, 0, 0], 8)
        || in_v4_network(value, [10, 0, 0, 0], 8)
        || in_v4_network(value, [100, 64, 0, 0], 10)
        || in_v4_network(value, [127, 0, 0, 0], 8)
        || in_v4_network(value, [169, 254, 0, 0], 16)
        || in_v4_network(value, [172, 16, 0, 0], 12)
        || in_v4_network(value, [192, 0, 0, 0], 24)
        || in_v4_network(value, [192, 0, 2, 0], 24)
        || in_v4_network(value, [192, 168, 0, 0], 16)
        || in_v4_network(value, [198, 18, 0, 0], 15)
        || in_v4_network(value, [198, 51, 100, 0], 24)
        || in_v4_network(value, [203, 0, 113, 0], 24)
        || in_v4_network(value, [224, 0, 0, 0], 4)
        || in_v4_network(value, [240, 0, 0, 0], 4)
}

fn in_v4_network(value: u32, network: [u8; 4], prefix: u32) -> bool {
    let mask = u32::MAX.checked_shl(32 - prefix).unwrap_or(0);
    value & mask == u32::from(Ipv4Addr::from(network)) & mask
}

fn is_non_public_v6(address: Ipv6Addr) -> bool {
    let segments = address.segments();
    address.is_unspecified()
        || address.is_loopback()
        || segments[..6] == [0, 0, 0, 0, 0, 0]
        || segments[..6] == [0x0064, 0xff9b, 0, 0, 0, 0]
        || (segments[0] == 0x0064 && segments[1] == 0xff9b && segments[2] == 1)
        || segments[0] & 0xfe00 == 0xfc00
        || segments[0] & 0xffc0 == 0xfe80
        || segments[0] & 0xffc0 == 0xfec0
        || segments[0] & 0xff00 == 0xff00
        || (segments[0] == 0x2001 && segments[1] == 0x0db8)
}

#[cfg(test)]
#[path = "target_policy_tests.rs"]
mod tests;
