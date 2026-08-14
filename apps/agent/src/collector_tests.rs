use super::{collect, technology_snapshots};

#[test]
fn collector_returns_bounded_consistent_host_metrics() {
    let snapshot = collect();

    assert!(!snapshot.hostname.is_empty());
    assert!(!snapshot.platform.is_empty());
    assert_eq!(snapshot.version, env!("CARGO_PKG_VERSION"));
    assert!((0.0..=100.0).contains(&snapshot.cpu_percent));
    assert!(snapshot.load_average >= 0.0);
    assert!(snapshot.memory_used_bytes <= snapshot.memory_total_bytes);
    assert!(snapshot.swap_used_bytes <= snapshot.swap_total_bytes);
    assert!(
        snapshot
            .disks
            .iter()
            .all(|disk| !disk.mount.is_empty() && disk.used_bytes <= disk.total_bytes)
    );
    assert!(snapshot.observed_at.contains('T'));
    assert!(snapshot.observed_at.ends_with('Z'));
}

#[test]
fn technology_collection_recognizes_supported_process_forms() {
    let technologies = technology_snapshots(
        [
            "NGINX.EXE",
            "postgres: writer",
            "node",
            "node.exe",
            "redis-server",
            "python-worker",
            "unknown",
        ]
        .into_iter()
        .map(str::to_owned),
    );

    let values = technologies
        .into_iter()
        .map(|technology| (technology.name, technology.category, technology.version))
        .collect::<Vec<_>>();
    assert_eq!(
        values,
        vec![
            ("nginx".to_owned(), "proxy".to_owned(), None),
            ("node".to_owned(), "runtime".to_owned(), None),
            ("postgres".to_owned(), "database".to_owned(), None),
            ("redis-server".to_owned(), "database".to_owned(), None),
        ]
    );
}

#[test]
fn technology_collection_covers_each_supported_category() {
    let technologies = technology_snapshots(
        ["caddy", "mariadbd", "java", "docker"]
            .into_iter()
            .map(str::to_owned),
    );
    let categories = technologies
        .into_iter()
        .map(|technology| technology.category)
        .collect::<Vec<_>>();
    assert_eq!(
        categories,
        vec!["proxy", "container", "runtime", "database"]
    );
}
