use crate::model::TargetPolicy;

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PolicyForm {
    pub limit_ip_addresses: bool,
    pub allowed_cidrs: String,
    pub limit_hostnames: bool,
    pub allowed_hostnames: String,
    pub limit_protocols: bool,
    pub http: bool,
    pub https: bool,
    pub tcp: bool,
    pub icmp: bool,
    pub limit_ports: bool,
    pub allowed_ports: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PolicyInput {
    pub allowed_cidrs: String,
    pub allowed_hostnames: String,
    pub allowed_protocols: String,
    pub allowed_ports: String,
}

impl PolicyForm {
    pub fn from_policy(policy: &TargetPolicy) -> Self {
        let restricted = !policy.allowed_protocols.is_empty();
        let allows = |protocol: &str| {
            !restricted
                || policy
                    .allowed_protocols
                    .iter()
                    .any(|value| value == protocol)
        };
        Self {
            limit_ip_addresses: !policy.allowed_cidrs.is_empty(),
            allowed_cidrs: policy.allowed_cidrs.join(", "),
            limit_hostnames: !policy.allowed_hostnames.is_empty(),
            allowed_hostnames: policy.allowed_hostnames.join(", "),
            limit_protocols: restricted,
            http: allows("http"),
            https: allows("https"),
            tcp: allows("tcp"),
            icmp: allows("icmp"),
            limit_ports: !policy.allowed_ports.is_empty(),
            allowed_ports: policy
                .allowed_ports
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", "),
        }
    }

    pub fn cidr_error(&self) -> Option<&'static str> {
        (self.limit_ip_addresses && self.allowed_cidrs.trim().is_empty())
            .then_some("Enter at least one CIDR")
    }

    pub fn hostname_error(&self) -> Option<&'static str> {
        (self.limit_hostnames && self.allowed_hostnames.trim().is_empty())
            .then_some("Enter at least one hostname")
    }

    pub fn protocol_error(&self) -> Option<&'static str> {
        (self.limit_protocols && !(self.http || self.https || self.tcp || self.icmp))
            .then_some("Select at least one protocol")
    }

    pub fn port_error(&self) -> Option<&'static str> {
        if !self.limit_ports {
            return None;
        }
        let ports = self
            .allowed_ports
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        if ports.is_empty() {
            Some("Enter at least one port")
        } else if ports
            .iter()
            .any(|value| !matches!(value.parse::<u16>(), Ok(port) if port > 0))
        {
            Some("Ports must be numbers from 1 to 65535")
        } else {
            None
        }
    }

    pub fn is_valid(&self) -> bool {
        self.cidr_error().is_none()
            && self.hostname_error().is_none()
            && self.protocol_error().is_none()
            && self.port_error().is_none()
    }

    pub fn input(&self) -> PolicyInput {
        let restricted = |limited: bool, value: &str| {
            if limited {
                value.trim().to_owned()
            } else {
                String::new()
            }
        };
        let allowed_protocols = if self.limit_protocols {
            [
                (self.http, "http"),
                (self.https, "https"),
                (self.tcp, "tcp"),
                (self.icmp, "icmp"),
            ]
            .into_iter()
            .filter_map(|(selected, protocol)| selected.then_some(protocol))
            .collect::<Vec<_>>()
            .join(",")
        } else {
            String::new()
        };
        PolicyInput {
            allowed_cidrs: restricted(self.limit_ip_addresses, &self.allowed_cidrs),
            allowed_hostnames: restricted(self.limit_hostnames, &self.allowed_hostnames),
            allowed_protocols,
            allowed_ports: restricted(self.limit_ports, &self.allowed_ports),
        }
    }
}

#[cfg(test)]
#[path = "policy_form_tests.rs"]
mod tests;
