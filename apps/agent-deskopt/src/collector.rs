use std::collections::BTreeMap;

use sysinfo::{Disks, Networks, System};

use crate::models::{DiskSnapshot, HostSnapshot, TechnologySnapshot};
use crate::time_now;

pub fn collect() -> HostSnapshot {
    let mut system = System::new_all();
    system.refresh_all();
    std::thread::sleep(std::time::Duration::from_millis(200));
    system.refresh_cpu_usage();
    let disks = Disks::new_with_refreshed_list();
    let networks = Networks::new_with_refreshed_list();
    let technologies = collect_technologies(&system);
    HostSnapshot {
        hostname: System::host_name().unwrap_or_else(|| "unknown".to_owned()),
        platform: format!(
            "{} {}",
            System::name().unwrap_or_else(|| std::env::consts::OS.to_owned()),
            System::os_version().unwrap_or_default()
        )
        .trim()
        .to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
        uptime_seconds: System::uptime(),
        cpu_percent: system.global_cpu_usage().clamp(0.0, 100.0),
        load_average: System::load_average().one.max(0.0),
        memory_used_bytes: system.used_memory(),
        memory_total_bytes: system.total_memory(),
        swap_used_bytes: system.used_swap(),
        swap_total_bytes: system.total_swap(),
        process_count: system.processes().len(),
        network_received_bytes: networks
            .values()
            .map(|network| network.total_received())
            .sum(),
        network_transmitted_bytes: networks
            .values()
            .map(|network| network.total_transmitted())
            .sum(),
        disks: disks
            .iter()
            .map(|disk| DiskSnapshot {
                mount: disk.mount_point().to_string_lossy().into_owned(),
                used_bytes: disk.total_space().saturating_sub(disk.available_space()),
                total_bytes: disk.total_space(),
            })
            .collect(),
        technologies,
        observed_at: time_now(),
    }
}

fn collect_technologies(system: &System) -> Vec<TechnologySnapshot> {
    technology_snapshots(
        system
            .processes()
            .values()
            .map(|process| process.name().to_string_lossy().into_owned()),
    )
}

fn technology_snapshots(names: impl IntoIterator<Item = String>) -> Vec<TechnologySnapshot> {
    let known = [
        ("nginx", "proxy"),
        ("apache", "proxy"),
        ("httpd", "proxy"),
        ("caddy", "proxy"),
        ("traefik", "proxy"),
        ("postgres", "database"),
        ("mysqld", "database"),
        ("mariadbd", "database"),
        ("redis-server", "database"),
        ("mongod", "database"),
        ("node", "runtime"),
        ("java", "runtime"),
        ("python", "runtime"),
        ("python3", "runtime"),
        ("dotnet", "runtime"),
        ("php", "runtime"),
        ("docker", "container"),
        ("containerd", "container"),
        ("podman", "container"),
    ];
    let mut observed = BTreeMap::new();
    for name in names {
        let process_name = name.to_ascii_lowercase();
        if let Some((name, category)) = known.iter().find(|(name, _)| {
            process_name == *name
                || process_name.starts_with(&format!("{name}."))
                || process_name.starts_with(&format!("{name}:"))
        }) {
            observed.insert((*name).to_owned(), (*category).to_owned());
        }
    }
    observed
        .into_iter()
        .map(|(name, category)| TechnologySnapshot {
            name,
            category,
            version: None,
        })
        .collect()
}

#[cfg(test)]
#[path = "collector_tests.rs"]
mod tests;
