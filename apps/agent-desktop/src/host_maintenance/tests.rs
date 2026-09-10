use serde_json::json;

use super::{Config, Issues, Observation, Observations, Updates, assess, evaluation};
use crate::models::{AgentTask, CheckState, CheckType, HostSnapshot};

fn no_issues() -> Observation<Issues> {
    Observation::Available {
        data: Issues {
            count: 0,
            examples: Vec::new(),
            unavailable: Vec::new(),
        },
    }
}

fn updates(count: u64, security_count: Option<u64>, age: Option<f64>) -> Observation<Updates> {
    Observation::Available {
        data: Updates {
            count,
            security_count,
            data_age_hours: age,
            examples: vec!["openssl 3.0.1 -> 3.0.2".to_owned()],
            security_examples: vec!["openssl 3.0.1 -> 3.0.2".to_owned()],
            unavailable: Vec::new(),
        },
    }
}

fn observations(updates: Observation<Updates>) -> Observations {
    Observations {
        updates,
        reboot: no_issues(),
        security: no_issues(),
        services: no_issues(),
    }
}

#[test]
fn omitted_settings_enable_maintenance_with_matching_contract_defaults() {
    let contract = include_str!("../../../../packages/contracts/src/index.ts");
    let config: Config = serde_json::from_value(json!({})).unwrap();
    assert!(
        config.security_updates
            && config.software_updates
            && config.reboot_required
            && config.security
            && config.failed_services
    );
    for (key, value) in [
        (
            "securityUpdateCriticalCount",
            config.security_update_critical_count,
        ),
        (
            "softwareUpdateWarningCount",
            config.software_update_warning_count,
        ),
        (
            "failedServiceWarningCount",
            config.failed_service_warning_count,
        ),
        ("maxUpdateAgeHours", config.max_update_age_hours),
    ] {
        assert!(contract.contains(&format!("{key}: {value},")));
    }
    let report = evaluation::evaluate(&config, observations(updates(0, Some(0), Some(1.0))));
    assert!(!report.warning());
    assert!(report.message().is_none());
    assert_eq!(report.metrics["maintenance.securityUpdates.status"], "okay");
}

#[test]
fn critical_updates_and_software_thresholds_are_inclusive() {
    let config = Config {
        security_update_critical_count: 2,
        software_update_warning_count: 3,
        ..Config::default()
    };
    let below = evaluation::evaluate(&config, observations(updates(2, Some(1), Some(2.0))));
    assert!(!below.warning());
    let warning = evaluation::evaluate(&config, observations(updates(3, Some(1), Some(2.0))));
    assert!(warning.warning());
    assert!(!warning.critical());
    let critical = evaluation::evaluate(&config, observations(updates(3, Some(2), Some(2.0))));
    assert!(critical.critical());
    assert_eq!(critical.metrics["pendingSecurityUpdateCount"], 2);
    assert!(
        critical
            .message()
            .unwrap()
            .starts_with("Security updates: 2 pending")
    );
}

#[test]
fn unavailable_stale_future_and_unclassified_update_data_cannot_pass() {
    for inventory in [
        Observation::unavailable("Permission denied"),
        updates(0, Some(0), None),
        updates(0, Some(0), Some(-1.0)),
        updates(0, Some(0), Some(73.0)),
        updates(0, None, Some(1.0)),
    ] {
        let report = evaluation::evaluate(&Config::default(), observations(inventory));
        assert!(report.warning());
        assert!(!report.critical());
        assert_eq!(
            report.metrics["maintenance.securityUpdates.status"],
            "unavailable"
        );
        assert!(!report.metrics.contains_key("pendingSecurityUpdateCount"));
    }
}

#[test]
fn stale_data_preserves_known_critical_updates_and_respects_age_configuration() {
    let stale = evaluation::evaluate(
        &Config::default(),
        observations(updates(1, Some(1), Some(73.0))),
    );
    assert!(stale.critical());
    assert_eq!(
        stale.metrics["maintenance.updateData.status"],
        "unavailable"
    );
    let config = Config {
        max_update_age_hours: 73,
        ..Config::default()
    };
    let current = evaluation::evaluate(&config, observations(updates(0, Some(0), Some(73.0))));
    assert!(!current.warning());
}

#[test]
fn reports_partial_security_failures_and_failed_service_thresholds() {
    let mut data = observations(updates(0, Some(0), Some(1.0)));
    data.security = Observation::Available {
        data: Issues {
            count: 1,
            examples: vec!["Windows Firewall is disabled: Public".to_owned()],
            unavailable: vec!["Defender state could not be read".to_owned()],
        },
    };
    data.services = Observation::Available {
        data: Issues {
            count: 2,
            examples: vec!["database.service".to_owned()],
            unavailable: Vec::new(),
        },
    };
    let config = Config {
        failed_service_warning_count: 3,
        ..Config::default()
    };
    let report = evaluation::evaluate(&config, data);
    assert!(report.critical());
    assert_eq!(report.metrics["maintenance.failedServices.status"], "okay");
    assert!(
        report.metrics["maintenance.security.detail"]
            .as_str()
            .unwrap()
            .contains("Unavailable: Defender")
    );
}

#[test]
fn disabled_checks_produce_no_findings_and_do_not_run_probes() {
    let config = Config {
        security_updates: false,
        software_updates: false,
        reboot_required: false,
        security: false,
        failed_services: false,
        ..Config::default()
    };
    assert!(assess(&config, 0).metrics.is_empty());
    let report = evaluation::evaluate(
        &config,
        Observations::unavailable("Assessment must be ignored"),
    );
    assert!(report.metrics.is_empty());
    assert!(!report.warning());
    let changed = Config {
        software_updates: true,
        ..config
    };
    let report = evaluation::evaluate(&changed, observations(updates(1, Some(1), Some(1.0))));
    assert!(!report.critical());
    assert!(report.warning());
    assert!(
        !report
            .metrics
            .contains_key("maintenance.securityUpdates.status")
    );
}

#[test]
fn rejects_invalid_maintenance_thresholds_and_boolean_types() {
    for value in [
        json!({"securityUpdates":"true"}),
        json!({"maxUpdateAgeHours":-1}),
        json!({"unknown":true}),
    ] {
        assert!(serde_json::from_value::<Config>(value).is_err());
    }
    for value in [
        json!({"securityUpdateCriticalCount":0}),
        json!({"softwareUpdateWarningCount":100001}),
        json!({"failedServiceWarningCount":0}),
        json!({"maxUpdateAgeHours":8761}),
    ] {
        assert!(
            serde_json::from_value::<Config>(value)
                .unwrap()
                .validate()
                .is_err()
        );
    }
}

#[test]
fn maintenance_integrates_with_resource_health_and_omitted_configuration() {
    let snapshot: HostSnapshot = serde_json::from_value(json!({
        "snapshotId":"snapshot", "hostname":"test", "platform":"test", "version":"1",
        "uptimeSeconds":100, "cpuPercent":10, "loadAverage":0, "memoryUsedBytes":10,
        "memoryTotalBytes":100, "swapUsedBytes":0, "swapTotalBytes":0, "processCount":1,
        "networkReceivedBytes":0, "networkTransmittedBytes":0, "disks":[], "technologies":[],
        "containerRuntime":null, "observedAt":"2026-09-09T00:00:00Z"
    }))
    .unwrap();
    let task = AgentTask {
        id: "task".to_owned(),
        _check_id: "check".to_owned(),
        check_type: CheckType::Host,
        timeout_ms: 30000,
        config: json!({"cpuWarningPercent":90,"cpuCriticalPercent":98,"memoryWarningPercent":90,"memoryCriticalPercent":98,"swapWarningPercent":90,"swapCriticalPercent":98}),
        secret: None,
        favicon_request_id: None,
        _issued_at: "2026-09-09T00:00:00Z".to_owned(),
    };
    for (data, state) in [
        (updates(0, Some(0), Some(1.0)), CheckState::Up),
        (updates(1, Some(0), Some(1.0)), CheckState::Degraded),
        (updates(1, Some(1), Some(1.0)), CheckState::Down),
        (Observation::unavailable("No data"), CheckState::Degraded),
    ] {
        let result =
            crate::host_check::execute_with_assessment(&task, &snapshot, |config, timeout| {
                assert_eq!(timeout, 30000);
                assert!(config.security_updates);
                evaluation::evaluate(config, observations(data))
            })
            .unwrap();
        assert_eq!(result.status, state);
        assert_eq!(result.metrics["cpuPercent"], 10.0);
    }
    let mut busy = snapshot;
    busy.cpu_percent = 100.0;
    let result = crate::host_check::execute_with_assessment(&task, &busy, |config, _| {
        evaluation::evaluate(config, Observations::unavailable("No data"))
    })
    .unwrap();
    assert_eq!(result.status, CheckState::Down);
    assert!(result.message.unwrap().contains("critical threshold"));
}
