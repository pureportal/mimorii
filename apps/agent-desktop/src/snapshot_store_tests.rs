use std::fs;

use super::SnapshotStore;
use crate::models::{DiskSnapshot, HostSnapshot, TechnologySnapshot};
use crate::test_support::temporary_path;

fn snapshot(observed_at: &str, cpu_percent: f32) -> HostSnapshot {
    HostSnapshot {
        snapshot_id: format!("snapshot-{observed_at}"),
        hostname: "relay-01".to_owned(),
        platform: "test".to_owned(),
        version: "0.1.0".to_owned(),
        uptime_seconds: 60,
        cpu_percent,
        load_average: 0.5,
        memory_used_bytes: 5,
        memory_total_bytes: 10,
        swap_used_bytes: 1,
        swap_total_bytes: 2,
        process_count: 3,
        network_received_bytes: 4,
        network_transmitted_bytes: 5,
        disks: vec![DiskSnapshot {
            mount: "/".to_owned(),
            used_bytes: 6,
            total_bytes: 10,
        }],
        technologies: vec![TechnologySnapshot {
            name: "postgres".to_owned(),
            category: "database".to_owned(),
            version: Some("16".to_owned()),
        }],
        container_runtime: None,
        observed_at: observed_at.to_owned(),
    }
}

#[test]
fn persists_every_collected_snapshot_in_order() {
    let directory = temporary_path("collected");
    let store = SnapshotStore::new(directory.clone());

    store
        .append(&snapshot("2026-08-13T10:00:00Z", 10.0))
        .unwrap();
    store
        .append(&snapshot("2026-08-13T10:00:15Z", 20.0))
        .unwrap();

    let batch = store.load().unwrap();
    assert_eq!(batch.snapshots().len(), 2);
    assert_eq!(batch.snapshots()[0].cpu_percent, 10.0);
    assert_eq!(batch.snapshots()[1].cpu_percent, 20.0);

    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn acknowledges_only_the_snapshots_in_the_transferred_batch() {
    let directory = temporary_path("collected");
    let store = SnapshotStore::new(directory.clone());
    store
        .append(&snapshot("2026-08-13T10:00:00Z", 10.0))
        .unwrap();
    let transferred = store.load().unwrap();
    store
        .append(&snapshot("2026-08-13T10:00:15Z", 20.0))
        .unwrap();

    store.acknowledge(&transferred).unwrap();

    let pending = store.load().unwrap();
    assert_eq!(pending.snapshots().len(), 1);
    assert_eq!(pending.snapshots()[0].cpu_percent, 20.0);

    fs::remove_dir_all(directory).unwrap();
}
