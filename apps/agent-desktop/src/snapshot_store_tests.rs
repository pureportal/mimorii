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

#[test]
fn retains_only_the_newest_snapshots_when_the_backlog_is_full() {
    let directory = temporary_path("bounded");
    let store = SnapshotStore::with_limits(directory.clone(), 3, 10, u64::MAX);

    for second in 0..5 {
        store
            .append(&snapshot(
                &format!("2026-08-13T10:00:0{second}Z"),
                second as f32,
            ))
            .unwrap();
    }

    let batch = store.load().unwrap();
    assert_eq!(store.pending().unwrap(), 3);
    assert_eq!(
        batch
            .snapshots()
            .iter()
            .map(|snapshot| snapshot.cpu_percent)
            .collect::<Vec<_>>(),
        [2.0, 3.0, 4.0]
    );

    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn loads_the_oldest_snapshots_in_bounded_batches() {
    let directory = temporary_path("batched");
    let store = SnapshotStore::with_limits(directory.clone(), 100, 2, u64::MAX);
    for second in 0..5 {
        store
            .append(&snapshot(
                &format!("2026-08-13T10:00:0{second}Z"),
                second as f32,
            ))
            .unwrap();
    }

    let first = store.load().unwrap();
    assert_eq!(first.snapshots().len(), 2);
    assert_eq!(first.snapshots()[0].cpu_percent, 0.0);
    store.acknowledge(&first).unwrap();
    assert_eq!(store.load().unwrap().snapshots()[0].cpu_percent, 2.0);
    assert_eq!(store.latest().unwrap().unwrap().cpu_percent, 4.0);

    let byte_limited = SnapshotStore::with_limits(directory.clone(), 100, 100, 1);
    assert_eq!(byte_limited.load().unwrap().snapshots().len(), 1);

    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn discards_unreadable_snapshots_instead_of_blocking_the_backlog() {
    let directory = temporary_path("corrupt");
    let store = SnapshotStore::new(directory.clone());
    store
        .append(&snapshot("2026-08-13T10:00:00Z", 10.0))
        .unwrap();
    fs::write(directory.join("00000000000000000000-corrupt.json"), b"{").unwrap();

    let batch = store.load().unwrap();

    assert_eq!(batch.discarded, 1);
    assert_eq!(batch.snapshots().len(), 1);
    assert_eq!(store.pending().unwrap(), 1);

    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn ignores_the_agent_state_kept_beside_collected_snapshots() {
    let directory = temporary_path("with-state");
    let store = SnapshotStore::new(directory.clone());
    store
        .append(&snapshot("2026-08-13T10:00:00Z", 10.0))
        .unwrap();
    fs::write(directory.join("agent.state"), b"{}").unwrap();

    assert_eq!(store.pending().unwrap(), 1);
    assert_eq!(store.load().unwrap().discarded, 0);
    store.clear().unwrap();
    assert!(directory.join("agent.state").exists());

    fs::remove_dir_all(directory).unwrap();
}
