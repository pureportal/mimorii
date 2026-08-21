use std::fs;

use super::{
    AgentConfig, ConfigRefresh, ConfigWatcher, collection_path, config_path, normalize_server_url,
};
use crate::test_support::temporary_path;

fn valid_key() -> String {
    format!("mim_agent_{}", "a".repeat(32))
}

#[test]
fn normalizes_root_and_nested_api_urls() {
    assert_eq!(
        normalize_server_url(" https://observe.example.com/ ", false).unwrap(),
        "https://observe.example.com/api"
    );
    assert_eq!(
        normalize_server_url("https://observe.example.com/mimorii", false).unwrap(),
        "https://observe.example.com/mimorii/api"
    );
    assert_eq!(
        normalize_server_url("https://observe.example.com/mimorii/api/", false).unwrap(),
        "https://observe.example.com/mimorii/api"
    );
}

#[test]
fn removes_query_and_fragment_components() {
    assert_eq!(
        normalize_server_url(
            "https://observe.example.com/base?token=secret#section",
            false
        )
        .unwrap(),
        "https://observe.example.com/base/api"
    );
}

#[test]
fn accepts_local_http_and_explicit_remote_http() {
    for server in [
        "http://localhost:4310",
        "http://127.0.0.1:4310",
        "http://[::1]:4310",
    ] {
        assert!(normalize_server_url(server, false).is_ok());
    }
    assert_eq!(
        normalize_server_url("http://10.0.0.4:4310", true).unwrap(),
        "http://10.0.0.4:4310/api"
    );
}

#[test]
fn rejects_invalid_protocols_and_implicit_remote_http() {
    assert!(normalize_server_url("not a URL", false).is_err());
    assert!(normalize_server_url("ftp://observe.example.com", false).is_err());
    assert!(normalize_server_url("https://", false).is_err());
    assert!(normalize_server_url("https://user:secret@observe.example.com", false).is_err());
    let error = normalize_server_url("http://10.0.0.4:4310", false).unwrap_err();
    assert_eq!(
        error.to_string(),
        "HTTP exposes the agent key; use HTTPS or pass --allow-insecure-http"
    );
}

#[test]
fn validates_agent_keys() {
    let config = AgentConfig::new("https://observe.example.com", &valid_key(), false).unwrap();
    assert_eq!(config.server_url, "https://observe.example.com/api");
    assert_eq!(config.agent_key, valid_key());

    assert!(
        AgentConfig::new(
            "https://observe.example.com",
            "wrong_1234567890123456789012345678901234567890",
            false
        )
        .is_err()
    );
    assert!(AgentConfig::new("https://observe.example.com", "mim_agent_short", false).is_err());
}

#[test]
fn check_runner_configuration_accepts_explicit_private_networks() {
    let config = AgentConfig::new_check_runner(
        "https://observe.example.com",
        &valid_key(),
        false,
        "10.20.0.0/16, 192.168.50.12/32",
    )
    .unwrap();

    assert_eq!(config.target_policy.allowed_cidrs.len(), 2);
    assert_eq!(
        config.target_policy.allowed_cidrs[0].to_string(),
        "10.20.0.0/16"
    );
    assert!(
        AgentConfig::new_check_runner(
            "https://observe.example.com",
            &valid_key(),
            false,
            "private-network",
        )
        .is_err()
    );
}

#[test]
fn saves_and_loads_camel_case_configuration_without_exposing_the_key() {
    let path = temporary_path("agent-desktop.json");
    let config = AgentConfig::new("https://observe.example.com", &valid_key(), false).unwrap();
    config.save_to(&path).unwrap();

    let serialized = fs::read_to_string(&path).unwrap();
    assert!(serialized.contains("\"serverUrl\""));
    assert!(serialized.contains("\"agentKey\""));
    assert!(serialized.contains("\"targetPolicy\""));
    assert!(serialized.contains("\"allowedCidrs\""));
    assert!(!serialized.contains("intervalSeconds"));
    let loaded = AgentConfig::load_from(&path).unwrap();
    assert_eq!(loaded.server_url, config.server_url);
    assert_eq!(loaded.agent_key, config.agent_key);
    let summary = loaded.public_summary();
    assert!(summary.contains("server: https://observe.example.com/api"));
    assert!(summary.contains("credential: enrolled"));
    assert!(!summary.contains(&valid_key()));

    fs::remove_dir_all(path.parent().unwrap()).unwrap();
}

#[test]
fn load_reports_missing_and_invalid_configuration() {
    let missing = temporary_path("missing.json");
    let error = AgentConfig::load_from(&missing).unwrap_err();
    assert!(error.to_string().contains("agent is not enrolled"));
    assert!(error.to_string().contains("missing.json"));

    let invalid = temporary_path("invalid.json");
    fs::create_dir_all(invalid.parent().unwrap()).unwrap();
    fs::write(&invalid, "not-json").unwrap();
    let error = AgentConfig::load_from(&invalid).unwrap_err();
    assert_eq!(error.to_string(), "agent configuration is invalid");

    let invalid_policy = temporary_path("invalid-policy.json");
    fs::create_dir_all(invalid_policy.parent().unwrap()).unwrap();
    let mut config = AgentConfig::new("https://observe.example.com", &valid_key(), false).unwrap();
    config.target_policy.allowed_hostnames = vec!["internal.*.example".to_owned()];
    fs::write(&invalid_policy, serde_json::to_vec(&config).unwrap()).unwrap();
    let error = AgentConfig::load_from(&invalid_policy).unwrap_err();
    assert_eq!(
        error.to_string(),
        "target policy contains an invalid hostname pattern"
    );

    let invalid_key = temporary_path("invalid-key.json");
    fs::create_dir_all(invalid_key.parent().unwrap()).unwrap();
    let mut config = AgentConfig::new("https://observe.example.com", &valid_key(), false).unwrap();
    config.agent_key = "mim_agent_short".to_owned();
    fs::write(&invalid_key, serde_json::to_vec(&config).unwrap()).unwrap();
    let error = AgentConfig::load_from(&invalid_key).unwrap_err();
    assert_eq!(error.to_string(), "agent key is invalid");
    fs::remove_dir_all(invalid.parent().unwrap()).unwrap();
}

#[test]
fn watcher_applies_valid_updates_and_retains_the_last_valid_configuration() {
    let path = temporary_path("agent-desktop.json");
    let mut watcher = ConfigWatcher::new(path.clone());
    assert!(matches!(watcher.refresh(), ConfigRefresh::Rejected(_)));
    assert_eq!(watcher.refresh(), ConfigRefresh::Unchanged);

    let first = AgentConfig::new("https://one.example.com", &valid_key(), false).unwrap();
    first.save_to(&path).unwrap();
    assert_eq!(watcher.refresh(), ConfigRefresh::Applied);
    assert_eq!(watcher.active(), Some(&first));

    fs::write(&path, "invalid").unwrap();
    assert!(matches!(watcher.refresh(), ConfigRefresh::Rejected(_)));
    assert_eq!(watcher.active(), Some(&first));
    assert_eq!(watcher.refresh(), ConfigRefresh::Unchanged);

    let second_key = format!("mim_agent_{}", "b".repeat(32));
    let second = AgentConfig::new("https://two.example.com", &second_key, false).unwrap();
    second.save_to(&path).unwrap();
    assert_eq!(watcher.refresh(), ConfigRefresh::Applied);
    assert_eq!(watcher.active(), Some(&second));
    assert_eq!(watcher.refresh(), ConfigRefresh::Unchanged);

    fs::remove_dir_all(path.parent().unwrap()).unwrap();
}

#[test]
fn replacing_configuration_is_atomic_and_removes_staging_files() {
    let path = temporary_path("agent-desktop.json");
    let first = AgentConfig::new("https://one.example.com", &valid_key(), false).unwrap();
    first.save_to(&path).unwrap();
    let second_key = format!("mim_agent_{}", "b".repeat(32));
    let second = AgentConfig::new("https://two.example.com", &second_key, false).unwrap();
    second.save_to(&path).unwrap();

    assert_eq!(AgentConfig::load_from(&path).unwrap(), second);
    assert!(fs::read_dir(path.parent().unwrap()).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".tmp")
    }));

    fs::remove_dir_all(path.parent().unwrap()).unwrap();
}

#[test]
fn resolves_the_platform_configuration_path() {
    let path = config_path().unwrap();
    assert_eq!(path.file_name().unwrap(), "agent-desktop.json");
    assert!(path.parent().is_some());
    let collection = collection_path().unwrap();
    assert_eq!(collection.file_name().unwrap(), "collected-snapshots");
}

#[cfg(unix)]
#[test]
fn saved_configuration_is_owner_only() {
    use std::os::unix::fs::PermissionsExt;

    let path = temporary_path("agent-desktop.json");
    AgentConfig::new("https://observe.example.com", &valid_key(), false)
        .unwrap()
        .save_to(&path)
        .unwrap();
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    fs::remove_dir_all(path.parent().unwrap()).unwrap();
}
