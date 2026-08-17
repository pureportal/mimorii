use std::cell::Cell;
use std::fs;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use clap::Parser;
use serde_json::{Value, json};

use super::{
    Cli, CollectionWorker, Command, ServiceAction, check_runner_cycle, cycle, run_configured_cycle,
    time_now,
};
use crate::config::AgentConfig;
use crate::models::{DiskSnapshot, HostSnapshot, TechnologySnapshot};
use crate::snapshot_store::SnapshotStore;
use crate::target_policy::TargetPolicy;
use crate::test_support::{MockResponse, http_server, tcp_listener, temporary_path};

fn valid_key() -> String {
    format!("mim_agent_{}", "a".repeat(32))
}

fn config(server_url: &str, key: String) -> AgentConfig {
    AgentConfig {
        server_url: format!("{server_url}/api"),
        agent_key: key,
        target_policy: TargetPolicy::default(),
    }
}

fn snapshot(observed_at: &str, cpu_percent: f32) -> HostSnapshot {
    HostSnapshot {
        hostname: "relay-01".to_owned(),
        platform: "test platform".to_owned(),
        version: "0.1.0".to_owned(),
        uptime_seconds: 600,
        cpu_percent,
        load_average: 0.4,
        memory_used_bytes: 4_000,
        memory_total_bytes: 8_000,
        swap_used_bytes: 100,
        swap_total_bytes: 1_000,
        process_count: 42,
        network_received_bytes: 10_000,
        network_transmitted_bytes: 5_000,
        disks: vec![DiskSnapshot {
            mount: "/".to_owned(),
            used_bytes: 20_000,
            total_bytes: 100_000,
        }],
        technologies: vec![TechnologySnapshot {
            name: "postgres".to_owned(),
            category: "database".to_owned(),
            version: Some("16".to_owned()),
        }],
        observed_at: observed_at.to_owned(),
    }
}

fn triggered_poll(interval_seconds: u64) -> String {
    json!({
        "collectionIntervalSeconds": interval_seconds,
        "tasks": [{
            "id": "task-1",
            "checkId": "check-1",
            "type": "host",
            "timeoutMs": 5_000,
            "config": {
                "cpuWarningPercent": 80,
                "cpuCriticalPercent": 90,
                "memoryWarningPercent": 80,
                "memoryCriticalPercent": 90,
                "loadWarning": 4,
                "loadCritical": 8,
                "swapWarningPercent": 80,
                "swapCriticalPercent": 90
            },
            "issuedAt": "2026-08-13T10:00:30Z"
        }]
    })
    .to_string()
}

#[test]
fn parses_enrollment_and_configuration_options() {
    for command_name in ["enroll", "configure"] {
        let cli = Cli::try_parse_from([
            "mimorii-agent-desktop",
            command_name,
            "--server",
            "http://localhost:4310",
            "--key",
            &valid_key(),
            "--allow-insecure-http",
        ])
        .unwrap();
        let (server, key, allow_insecure_http) = match cli.command {
            Command::Enroll {
                server,
                key,
                allow_insecure_http,
            }
            | Command::Configure {
                server,
                key,
                allow_insecure_http,
            } => (server, key, allow_insecure_http),
            _ => panic!("unexpected command"),
        };
        assert_eq!(server, "http://localhost:4310");
        assert_eq!(key, valid_key());
        assert!(allow_insecure_http);
    }
}

#[test]
fn parses_all_runtime_and_service_commands() {
    assert!(matches!(
        Cli::try_parse_from([
            "mimorii-agent-desktop",
            "check-runner",
            "--server",
            "https://observe.example.com",
            "--key",
            &valid_key(),
            "--allowed-cidrs",
            "10.20.0.0/16,192.168.50.0/24",
            "--once",
        ])
        .unwrap()
        .command,
        Command::CheckRunner {
            server,
            key,
            allow_insecure_http: false,
            allowed_cidrs,
            once: true,
        } if server == "https://observe.example.com"
            && key == valid_key()
            && allowed_cidrs == "10.20.0.0/16,192.168.50.0/24"
    ));
    assert!(matches!(
        Cli::try_parse_from(["mimorii-agent-desktop", "run"])
            .unwrap()
            .command,
        Command::Run
    ));
    assert!(matches!(
        Cli::try_parse_from(["mimorii-agent-desktop", "once"])
            .unwrap()
            .command,
        Command::Once
    ));
    assert!(matches!(
        Cli::try_parse_from(["mimorii-agent-desktop", "doctor"])
            .unwrap()
            .command,
        Command::Doctor
    ));
    assert!(matches!(
        Cli::try_parse_from(["mimorii-agent-desktop", "status"])
            .unwrap()
            .command,
        Command::Status
    ));
    assert!(matches!(
        Cli::try_parse_from(["mimorii-agent-desktop", "service", "install"])
            .unwrap()
            .command,
        Command::Service {
            action: ServiceAction::Install
        }
    ));
    assert!(matches!(
        Cli::try_parse_from(["mimorii-agent-desktop", "service", "uninstall"])
            .unwrap()
            .command,
        Command::Service {
            action: ServiceAction::Uninstall
        }
    ));
}

#[test]
fn rejects_missing_arguments_and_local_interval_configuration() {
    assert!(Cli::try_parse_from(["mimorii-agent-desktop"]).is_err());
    assert!(
        Cli::try_parse_from([
            "mimorii-agent-desktop",
            "enroll",
            "--server",
            "https://observe.example.com"
        ])
        .is_err()
    );
    assert!(
        Cli::try_parse_from([
            "mimorii-agent-desktop",
            "configure",
            "--server",
            "https://observe.example.com",
            "--key",
            &valid_key(),
            "--interval-seconds",
            "45"
        ])
        .is_err()
    );
}

#[test]
fn polling_without_a_trigger_keeps_every_snapshot_local() {
    let server = http_server(vec![MockResponse::new(
        200,
        r#"{"collectionIntervalSeconds":45,"tasks":[]}"#,
    )]);
    let directory = temporary_path("collected");
    let store = SnapshotStore::new(directory.clone());
    store
        .append(&snapshot("2026-08-13T10:00:00Z", 10.0))
        .unwrap();
    store
        .append(&snapshot("2026-08-13T10:00:15Z", 20.0))
        .unwrap();

    let configured_interval = Cell::new(0);
    let outcome = cycle(&config(&server.url, valid_key()), &store, |seconds| {
        configured_interval.set(seconds);
        Ok(())
    })
    .unwrap();

    assert_eq!(configured_interval.get(), 45);
    assert!(outcome.heartbeat.unwrap().is_none());
    assert_eq!(store.load().unwrap().snapshots().len(), 2);
    let poll = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    assert!(poll.starts_with("GET /api/agent/tasks?limit=100 HTTP/1.1"));
    assert!(server.requests.try_recv().is_err());

    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn trigger_transfers_and_acknowledges_the_complete_collected_dataset() {
    let server = http_server(vec![
        MockResponse::new(200, triggered_poll(45)),
        MockResponse::new(
            200,
            r#"{"acceptedAt":"2026-08-13T10:00:31Z","acceptedSnapshots":2,"acceptedResults":1}"#,
        ),
    ]);
    let directory = temporary_path("collected");
    let store = SnapshotStore::new(directory.clone());
    store
        .append(&snapshot("2026-08-13T10:00:00Z", 10.0))
        .unwrap();
    store
        .append(&snapshot("2026-08-13T10:00:15Z", 20.0))
        .unwrap();

    let outcome = cycle(&config(&server.url, valid_key()), &store, |_| Ok(())).unwrap();

    let response = outcome.heartbeat.unwrap().unwrap();
    assert_eq!(response.accepted_snapshots, 2);
    assert_eq!(response.accepted_results, 1);
    assert!(store.load().unwrap().is_empty());
    let _poll = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    let heartbeat = server
        .requests
        .recv_timeout(Duration::from_secs(2))
        .unwrap();
    let payload: Value = serde_json::from_str(heartbeat.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(payload["snapshots"].as_array().unwrap().len(), 2);
    assert_eq!(payload["snapshots"][0]["cpuPercent"], 10.0);
    assert_eq!(payload["snapshots"][1]["cpuPercent"], 20.0);
    assert_eq!(payload["results"][0]["taskId"], "task-1");
    assert_eq!(
        payload["capabilities"],
        json!(["http", "tcp", "dns", "host", "disk"])
    );

    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn check_runner_registers_network_capabilities_and_never_sends_host_snapshots() {
    let (listener, port) = tcp_listener();
    let listener_handle = thread::spawn(move || listener.accept().unwrap());
    let server = http_server(vec![
        MockResponse::new(
            200,
            r#"{"acceptedAt":"2026-08-13T10:00:29Z","acceptedSnapshots":0,"acceptedResults":0}"#,
        ),
        MockResponse::new(
            200,
            json!({
                "collectionIntervalSeconds": 30,
                "tasks": [{
                    "id": "task-1",
                    "checkId": "check-1",
                    "type": "tcp",
                    "timeoutMs": 2_000,
                    "config": { "host": "127.0.0.1", "port": port },
                    "issuedAt": "2026-08-13T10:00:30Z"
                }]
            })
            .to_string(),
        ),
        MockResponse::new(
            200,
            r#"{"acceptedAt":"2026-08-13T10:00:31Z","acceptedSnapshots":0,"acceptedResults":1}"#,
        ),
    ]);
    let mut agent_config = config(&server.url, valid_key());
    agent_config.target_policy.allowed_cidrs = vec!["127.0.0.0/8".parse().unwrap()];

    let response = check_runner_cycle(&agent_config).unwrap().unwrap();

    assert_eq!(response.accepted_snapshots, 0);
    assert_eq!(response.accepted_results, 1);
    listener_handle.join().unwrap();
    let registration = server
        .requests
        .recv_timeout(Duration::from_secs(2))
        .unwrap();
    let poll = server
        .requests
        .recv_timeout(Duration::from_secs(2))
        .unwrap();
    let heartbeat = server
        .requests
        .recv_timeout(Duration::from_secs(2))
        .unwrap();
    let registration_payload: Value =
        serde_json::from_str(registration.split_once("\r\n\r\n").unwrap().1).unwrap();
    let heartbeat_payload: Value =
        serde_json::from_str(heartbeat.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(registration_payload["snapshots"], json!([]));
    assert_eq!(
        registration_payload["capabilities"],
        json!(["http", "tcp", "dns"])
    );
    assert_eq!(
        registration_payload["agentVersion"],
        env!("CARGO_PKG_VERSION")
    );
    assert!(poll.starts_with("GET /api/agent/tasks?limit=100 HTTP/1.1"));
    assert_eq!(heartbeat_payload["snapshots"], json!([]));
    assert_eq!(heartbeat_payload["results"][0]["taskId"], "task-1");
    assert_eq!(heartbeat_payload["results"][0]["status"], "up");
    assert!(heartbeat_payload.get("hostname").is_none());
}

#[test]
fn trigger_collects_immediately_when_the_store_is_empty() {
    let server = http_server(vec![
        MockResponse::new(200, triggered_poll(30)),
        MockResponse::new(
            200,
            r#"{"acceptedAt":"2026-08-13T10:00:31Z","acceptedSnapshots":1,"acceptedResults":1}"#,
        ),
    ]);
    let directory = temporary_path("collected");
    let store = SnapshotStore::new(directory.clone());

    let outcome = cycle(&config(&server.url, valid_key()), &store, |_| Ok(())).unwrap();

    let response = outcome.heartbeat.unwrap().unwrap();
    assert_eq!(response.accepted_snapshots, 1);
    assert_eq!(response.accepted_results, 1);
    assert!(store.load().unwrap().is_empty());
    let _poll = server
        .requests
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
    let heartbeat = server
        .requests
        .recv_timeout(Duration::from_secs(2))
        .unwrap();
    let payload: Value = serde_json::from_str(heartbeat.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(payload["snapshots"].as_array().unwrap().len(), 1);
    assert_eq!(payload["results"][0]["taskId"], "task-1");

    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn failed_trigger_transfer_retains_the_complete_dataset_for_retry() {
    let server = http_server(vec![
        MockResponse::new(200, triggered_poll(30)),
        MockResponse::new(500, "failure"),
    ]);
    let directory = temporary_path("collected");
    let store = SnapshotStore::new(directory.clone());
    store
        .append(&snapshot("2026-08-13T10:00:00Z", 10.0))
        .unwrap();
    store
        .append(&snapshot("2026-08-13T10:00:15Z", 20.0))
        .unwrap();

    let outcome = cycle(&config(&server.url, valid_key()), &store, |_| Ok(())).unwrap();
    assert!(outcome.heartbeat.is_err());

    let pending = store.load().unwrap();
    assert_eq!(pending.snapshots().len(), 2);
    assert_eq!(pending.snapshots()[0].cpu_percent, 10.0);
    assert_eq!(pending.snapshots()[1].cpu_percent, 20.0);

    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn partial_snapshot_acknowledgement_retains_the_complete_dataset_for_retry() {
    let server = http_server(vec![
        MockResponse::new(200, triggered_poll(30)),
        MockResponse::new(
            200,
            r#"{"acceptedAt":"2026-08-13T10:00:31Z","acceptedSnapshots":1,"acceptedResults":1}"#,
        ),
    ]);
    let directory = temporary_path("collected");
    let store = SnapshotStore::new(directory.clone());
    store
        .append(&snapshot("2026-08-13T10:00:00Z", 10.0))
        .unwrap();
    store
        .append(&snapshot("2026-08-13T10:00:15Z", 20.0))
        .unwrap();

    let outcome = cycle(&config(&server.url, valid_key()), &store, |_| Ok(())).unwrap();

    assert!(outcome.heartbeat.is_err());
    assert_eq!(store.load().unwrap().snapshots().len(), 2);

    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn collection_worker_honors_the_mimorii_collection_interval() {
    let (interval_sender, interval_receiver) = mpsc::channel();
    let (_error_sender, error_receiver) = mpsc::channel();
    let mut collection = CollectionWorker {
        interval: Duration::from_secs(30),
        interval_sender,
        error_receiver,
    };

    collection.configure(45).unwrap();

    assert_eq!(
        interval_receiver
            .recv_timeout(Duration::from_secs(1))
            .unwrap(),
        Duration::from_secs(45)
    );
    assert_eq!(collection.interval, Duration::from_secs(45));
}

#[test]
fn configured_cycles_reload_the_agent_key_and_server_interval() {
    let server = http_server(vec![
        MockResponse::new(200, r#"{"collectionIntervalSeconds":30,"tasks":[]}"#),
        MockResponse::new(200, r#"{"collectionIntervalSeconds":45,"tasks":[]}"#),
    ]);
    let path = temporary_path("agent-desktop.json");
    let store = SnapshotStore::new(temporary_path("collected"));
    let first_key = valid_key();
    let second_key = format!("mim_agent_{}", "b".repeat(32));

    for (key, expected_interval) in [(&first_key, 30), (&second_key, 45)] {
        let value = config(&server.url, key.clone());
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        let configured_interval = Cell::new(0);
        let outcome = run_configured_cycle(&path, &store, |seconds| {
            configured_interval.set(seconds);
            Ok(())
        })
        .unwrap();
        assert_eq!(configured_interval.get(), expected_interval);
        assert!(outcome.heartbeat.unwrap().is_none());
    }

    let requests = (0..2)
        .map(|_| {
            server
                .requests
                .recv_timeout(Duration::from_secs(2))
                .unwrap()
        })
        .collect::<Vec<_>>();
    assert!(requests[0].contains(&format!("authorization: Bearer {first_key}")));
    assert!(requests[1].contains(&format!("authorization: Bearer {second_key}")));

    fs::remove_dir_all(path.parent().unwrap()).unwrap();
}

#[test]
fn generated_timestamps_are_utc_rfc3339_values() {
    let value = time_now();
    assert!(value.contains('T'));
    assert!(value.ends_with('Z'));
}
