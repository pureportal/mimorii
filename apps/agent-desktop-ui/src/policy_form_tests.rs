use super::PolicyForm;
use crate::model::TargetPolicy;

#[test]
fn unrestricted_policy_saves_empty_restrictions() {
    let form = PolicyForm::from_policy(&TargetPolicy::default());
    assert!(!form.limit_ip_addresses);
    assert!(!form.limit_protocols);
    assert!(form.is_valid());
    let input = form.input();
    assert!(input.allowed_cidrs.is_empty());
    assert!(input.allowed_hostnames.is_empty());
    assert!(input.allowed_protocols.is_empty());
    assert!(input.allowed_ports.is_empty());
}

#[test]
fn restricted_policy_preserves_configured_values() {
    let form = PolicyForm::from_policy(&TargetPolicy {
        allowed_cidrs: vec!["10.0.0.0/8".to_owned()],
        allowed_hostnames: vec!["*.internal.example".to_owned()],
        allowed_protocols: vec!["https".to_owned(), "tcp".to_owned()],
        allowed_ports: vec![443, 5432],
    });
    assert!(form.limit_ip_addresses && form.limit_hostnames && form.limit_protocols);
    assert!(!form.http && form.https && form.tcp && !form.icmp);
    let input = form.input();
    assert_eq!(input.allowed_cidrs, "10.0.0.0/8");
    assert_eq!(input.allowed_hostnames, "*.internal.example");
    assert_eq!(input.allowed_protocols, "https,tcp");
    assert_eq!(input.allowed_ports, "443, 5432");
}

#[test]
fn enabled_limits_need_values_before_saving() {
    let mut form = PolicyForm {
        limit_ip_addresses: true,
        limit_protocols: true,
        limit_ports: true,
        allowed_ports: "443, 70000".to_owned(),
        ..PolicyForm::default()
    };
    assert_eq!(form.cidr_error(), Some("Enter at least one CIDR"));
    assert_eq!(form.protocol_error(), Some("Select at least one protocol"));
    assert_eq!(
        form.port_error(),
        Some("Ports must be numbers from 1 to 65535")
    );
    assert!(!form.is_valid());

    form.allowed_cidrs = "192.168.1.0/24".to_owned();
    form.tcp = true;
    form.allowed_ports = "443, 8443".to_owned();
    assert!(form.is_valid());
    assert_eq!(form.input().allowed_protocols, "tcp");
}
