use std::collections::BTreeMap;
#[cfg(windows)]
use std::ffi::c_void;
#[cfg(windows)]
use std::time::Duration;

#[cfg(windows)]
use anyhow::Context;
use anyhow::Result;
use sysinfo::{Disks, Networks, System};
#[cfg(windows)]
use windows_sys::Win32::Foundation::FILETIME;
#[cfg(windows)]
use windows_sys::Win32::System::ProcessStatus::{
    ENUM_PAGE_FILE_INFORMATION, K32EnumPageFilesW, K32GetPerformanceInfo, PERFORMANCE_INFORMATION,
};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::GetSystemTimes;
#[cfg(windows)]
use windows_sys::core::{BOOL, PCWSTR};

use crate::containers;
use crate::models::{DiskSnapshot, HostSnapshot, TechnologySnapshot};
use crate::time_now;

pub fn collect() -> Result<HostSnapshot> {
    let mut system = System::new_all();
    let cpu_percent = sample_cpu_percent(&mut system)?;
    let (swap_used_bytes, swap_total_bytes) = swap_bytes(&system)?;
    let disks = Disks::new_with_refreshed_list();
    let networks = Networks::new_with_refreshed_list();
    let technologies = collect_technologies(&system);
    Ok(HostSnapshot {
        snapshot_id: uuid::Uuid::new_v4().to_string(),
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
        cpu_percent,
        load_average: System::load_average().one.max(0.0),
        memory_used_bytes: system.used_memory(),
        memory_total_bytes: system.total_memory(),
        swap_used_bytes,
        swap_total_bytes,
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
        container_runtime: containers::collect(),
        observed_at: time_now(),
    })
}

#[cfg(not(windows))]
fn sample_cpu_percent(system: &mut System) -> Result<f32> {
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL + std::time::Duration::from_millis(1));
    system.refresh_cpu_usage();
    Ok(system.global_cpu_usage().clamp(0.0, 100.0))
}

#[cfg(windows)]
fn sample_cpu_percent(_system: &mut System) -> Result<f32> {
    sample_windows_cpu_percent()
}

#[cfg(any(windows, test))]
#[derive(Clone, Copy)]
struct CpuTimes {
    idle: u64,
    kernel: u64,
    user: u64,
}

#[cfg(windows)]
fn sample_windows_cpu_percent() -> Result<f32> {
    let previous = windows_cpu_times()?;
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL + Duration::from_millis(1));
    let current = windows_cpu_times()?;
    cpu_percent_from_times(previous, current).context("Windows CPU counters did not advance")
}

#[cfg(windows)]
fn windows_cpu_times() -> Result<CpuTimes> {
    let mut idle = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut kernel = idle;
    let mut user = idle;
    if unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } == 0 {
        return Err(std::io::Error::last_os_error()).context("failed to read Windows CPU counters");
    }
    Ok(CpuTimes {
        idle: file_time_value(idle),
        kernel: file_time_value(kernel),
        user: file_time_value(user),
    })
}

#[cfg(windows)]
fn file_time_value(value: FILETIME) -> u64 {
    (u64::from(value.dwHighDateTime) << 32) | u64::from(value.dwLowDateTime)
}

#[cfg(any(windows, test))]
fn cpu_percent_from_times(previous: CpuTimes, current: CpuTimes) -> Option<f32> {
    let idle = current.idle.checked_sub(previous.idle)?;
    let kernel = current.kernel.checked_sub(previous.kernel)?;
    let user = current.user.checked_sub(previous.user)?;
    let total = kernel.checked_add(user)?;
    let active = total.checked_sub(idle)?;
    (total > 0).then(|| (active as f64 / total as f64 * 100.0).clamp(0.0, 100.0) as f32)
}

#[cfg(not(windows))]
fn swap_bytes(system: &System) -> Result<(u64, u64)> {
    Ok((system.used_swap(), system.total_swap()))
}

#[cfg(any(windows, test))]
#[derive(Default)]
struct PageFileUsage {
    total_pages: u64,
    used_pages: u64,
}

#[cfg(any(windows, test))]
impl PageFileUsage {
    fn add(&mut self, total_pages: u64, used_pages: u64) {
        self.total_pages = self.total_pages.saturating_add(total_pages);
        self.used_pages = self.used_pages.saturating_add(used_pages.min(total_pages));
    }

    fn bytes(&self, page_size: u64) -> (u64, u64) {
        (
            self.used_pages.saturating_mul(page_size),
            self.total_pages.saturating_mul(page_size),
        )
    }
}

#[cfg(windows)]
fn swap_bytes(_system: &System) -> Result<(u64, u64)> {
    let mut performance = PERFORMANCE_INFORMATION::default();
    if unsafe {
        K32GetPerformanceInfo(
            &mut performance,
            std::mem::size_of::<PERFORMANCE_INFORMATION>() as u32,
        )
    } == 0
    {
        return Err(std::io::Error::last_os_error())
            .context("failed to read the Windows memory page size");
    }

    let mut usage = PageFileUsage::default();
    if unsafe {
        K32EnumPageFilesW(
            Some(collect_page_file_usage),
            (&mut usage as *mut PageFileUsage).cast(),
        )
    } == 0
    {
        return Err(std::io::Error::last_os_error())
            .context("failed to read Windows page-file usage");
    }
    Ok(usage.bytes(performance.PageSize as u64))
}

#[cfg(windows)]
unsafe extern "system" fn collect_page_file_usage(
    context: *mut c_void,
    information: *mut ENUM_PAGE_FILE_INFORMATION,
    _filename: PCWSTR,
) -> BOOL {
    if context.is_null() || information.is_null() {
        return 0;
    }
    let usage = unsafe { &mut *context.cast::<PageFileUsage>() };
    let information = unsafe { &*information };
    usage.add(information.TotalSize as u64, information.TotalInUse as u64);
    1
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
