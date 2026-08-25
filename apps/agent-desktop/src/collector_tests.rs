use super::{CpuTimes, PageFileUsage, collect, cpu_percent_from_times, technology_snapshots};

#[test]
fn collector_returns_bounded_consistent_host_metrics() {
    let snapshot = collect().unwrap();

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
fn cpu_percent_uses_elapsed_idle_kernel_and_user_time() {
    let previous = CpuTimes {
        idle: 100,
        kernel: 200,
        user: 100,
    };
    let current = CpuTimes {
        idle: 140,
        kernel: 270,
        user: 130,
    };

    assert_eq!(cpu_percent_from_times(previous, current), Some(60.0));
    assert_eq!(cpu_percent_from_times(current, current), None);
}

#[test]
fn page_file_usage_sums_files_and_converts_pages_to_bytes() {
    let mut usage = PageFileUsage::default();
    usage.add(1_000, 250);
    usage.add(2_000, 750);

    assert_eq!(usage.bytes(4_096), (4_096_000, 12_288_000));
}

#[test]
fn page_file_usage_keeps_used_bytes_within_total_bytes() {
    let mut usage = PageFileUsage::default();
    usage.add(10, 20);

    assert_eq!(usage.bytes(4_096), (40_960, 40_960));
}

#[cfg(windows)]
#[test]
fn windows_cpu_sampler_observes_activity() {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    let running = Arc::new(AtomicBool::new(true));
    let worker_running = running.clone();
    let worker = std::thread::spawn(move || {
        while worker_running.load(Ordering::Relaxed) {
            std::hint::spin_loop();
        }
    });

    let cpu_percent = super::sample_windows_cpu_percent();
    running.store(false, Ordering::Relaxed);
    worker.join().unwrap();
    let cpu_percent = cpu_percent.unwrap();

    assert!(cpu_percent > 0.0);
    assert!(cpu_percent <= 100.0);
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
