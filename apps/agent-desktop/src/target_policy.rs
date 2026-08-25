use std::collections::HashSet;
use std::net::{IpAddr, SocketAddr};
use std::str::FromStr;

use anyhow::{Context, Result, bail};
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

impl TargetProtocol {
    pub const ALL: [Self; 4] = [Self::Http, Self::Https, Self::Tcp, Self::Icmp];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Http => "HTTP",
            Self::Https => "HTTPS",
            Self::Tcp => "TCP",
            Self::Icmp => "ICMP",
        }
    }
}

impl FromStr for TargetProtocol {
    type Err = anyhow::Error;

    fn from_str(value: &str) -> Result<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "http" => Ok(Self::Http),
            "https" => Ok(Self::Https),
            "tcp" => Ok(Self::Tcp),
            "icmp" => Ok(Self::Icmp),
            _ => bail!("allowed protocol is invalid: {value}"),
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TargetPolicy {
    pub allowed_cidrs: Vec<IpNet>,
    pub allowed_hostnames: Vec<String>,
    pub allowed_protocols: Vec<TargetProtocol>,
    pub allowed_ports: Vec<u16>,
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
        if (!self.allowed_protocols.is_empty() && !self.allowed_protocols.contains(&protocol))
            || (!self.allowed_ports.is_empty() && !self.allowed_ports.contains(&port))
            || !self.hostname_allowed(hostname)
        {
            bail!("Target is not allowed by agent policy");
        }
        Ok(())
    }

    pub fn authorize_host(&self, protocol: TargetProtocol, hostname: &str) -> Result<()> {
        if (!self.allowed_protocols.is_empty() && !self.allowed_protocols.contains(&protocol))
            || !self.hostname_allowed(hostname)
        {
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
        if self.allowed_hostnames.is_empty() {
            return true;
        }
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
        self.allowed_cidrs.is_empty()
            || self
                .allowed_cidrs
                .iter()
                .any(|network| network.contains(&address))
    }

    pub fn set_allowed_cidrs(&mut self, value: &str) -> Result<()> {
        self.allowed_cidrs = csv_values(value)
            .map(|value| {
                value
                    .parse::<IpNet>()
                    .with_context(|| format!("allowed CIDR is invalid: {value}"))
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(())
    }

    pub fn set_allowed_hostnames(&mut self, value: &str) -> Result<()> {
        self.allowed_hostnames = csv_values(value).map(str::to_owned).collect();
        self.validate()
    }

    pub fn set_allowed_protocols(&mut self, value: &str) -> Result<()> {
        self.allowed_protocols = csv_values(value)
            .map(str::parse)
            .collect::<Result<Vec<_>>>()?;
        Ok(())
    }

    pub fn set_allowed_ports(&mut self, value: &str) -> Result<()> {
        self.allowed_ports = csv_values(value)
            .map(|value| {
                value
                    .parse::<u16>()
                    .with_context(|| format!("allowed port is invalid: {value}"))
            })
            .collect::<Result<Vec<_>>>()?;
        self.validate()
    }
}

fn csv_values(value: &str) -> impl Iterator<Item = &str> {
    value
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
#[path = "target_policy_tests.rs"]
mod tests;
