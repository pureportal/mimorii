#[cfg(any(target_os = "linux", test))]
use std::process::Command;

#[cfg(any(target_os = "linux", test))]
use anyhow::{Result, bail};

#[cfg(target_os = "linux")]
pub fn install(executable: &std::path::Path) -> Result<()> {
    use std::fs;

    let directory = directories::BaseDirs::new()
        .ok_or_else(|| anyhow::anyhow!("could not determine the user home directory"))?
        .config_dir()
        .join("systemd/user");
    fs::create_dir_all(&directory)?;
    let unit = directory.join("mimorii-agent-desktop.service");
    let content = format!(
        "[Unit]\nDescription=Mimorii desktop monitoring agent\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nExecStart=\"{}\" run\nRestart=on-failure\nRestartSec=10\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=read-only\n\n[Install]\nWantedBy=default.target\n",
        executable.display()
    );
    fs::write(&unit, content)?;
    command("systemctl", &["--user", "daemon-reload"])?;
    command(
        "systemctl",
        &["--user", "enable", "--now", "mimorii-agent-desktop.service"],
    )?;
    println!("installed {}", unit.display());
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn uninstall() -> Result<()> {
    let _ = command(
        "systemctl",
        &[
            "--user",
            "disable",
            "--now",
            "mimorii-agent-desktop.service",
        ],
    );
    let directory = directories::BaseDirs::new()
        .ok_or_else(|| anyhow::anyhow!("could not determine the user home directory"))?
        .config_dir()
        .join("systemd/user");
    let unit = directory.join("mimorii-agent-desktop.service");
    if unit.exists() {
        std::fs::remove_file(unit)?;
    }
    command("systemctl", &["--user", "daemon-reload"])?;
    Ok(())
}

#[cfg(windows)]
mod windows {
    use std::ffi::OsString;
    use std::fs::{self, File, OpenOptions};
    use std::io::Write;
    use std::sync::mpsc;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use anyhow::{Context, Result, bail};
    use windows_service::define_windows_service;
    use windows_service::service::{
        ServiceAccess, ServiceControl, ServiceControlAccept, ServiceExitCode,
        ServiceState as WindowsServiceState, ServiceStatus, ServiceType,
    };
    use windows_service::service_control_handler::{
        self, ServiceControlHandlerResult, ServiceStatusHandle,
    };
    use windows_service::service_dispatcher;
    use windows_service::service_manager::{ServiceManager, ServiceManagerAccess};

    use crate::runtime::RuntimeReporter;

    pub const SERVICE_NAME: &str = "MimoriiAgent";
    const LOG_LIMIT_BYTES: u64 = 5 * 1024 * 1024;
    const CONTROL_TIMEOUT: Duration = Duration::from_secs(30);

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    pub enum AgentServiceState {
        Stopped,
        Starting,
        Stopping,
        Running,
        Continuing,
        Pausing,
        Paused,
    }

    impl AgentServiceState {
        pub fn as_str(self) -> &'static str {
            match self {
                Self::Stopped => "stopped",
                Self::Starting => "starting",
                Self::Stopping => "stopping",
                Self::Running => "running",
                Self::Continuing => "continuing",
                Self::Pausing => "pausing",
                Self::Paused => "paused",
            }
        }
    }

    define_windows_service!(service_main, dispatch_service);

    pub fn run() -> Result<()> {
        service_dispatcher::start(SERVICE_NAME, service_main)
            .context("could not connect the Mimorii agent to the Windows Service Control Manager")
    }

    pub fn print_status() -> Result<()> {
        println!("service: {}", status()?.as_str());
        Ok(())
    }

    pub fn status() -> Result<AgentServiceState> {
        let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)
            .context("could not open the Windows Service Control Manager")?;
        let service = manager
            .open_service(SERVICE_NAME, ServiceAccess::QUERY_STATUS)
            .context("Mimorii Agent is not installed")?;
        Ok(map_state(service.query_status()?.current_state))
    }

    pub fn start() -> Result<()> {
        let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)
            .context("could not open the Windows Service Control Manager")?;
        let service = manager
            .open_service(
                SERVICE_NAME,
                ServiceAccess::QUERY_STATUS | ServiceAccess::START,
            )
            .context("Mimorii Agent is not installed")?;
        let current = service.query_status()?.current_state;
        if current == WindowsServiceState::Running {
            return Ok(());
        }
        if current != WindowsServiceState::Stopped {
            bail!(
                "Mimorii Agent cannot start while it is {}",
                state_name(current)
            );
        }
        service.start::<&std::ffi::OsStr>(&[])?;
        wait_for_state(&service, WindowsServiceState::Running)
    }

    pub fn stop() -> Result<()> {
        let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)
            .context("could not open the Windows Service Control Manager")?;
        let service = manager
            .open_service(
                SERVICE_NAME,
                ServiceAccess::QUERY_STATUS | ServiceAccess::STOP,
            )
            .context("Mimorii Agent is not installed")?;
        let current = service.query_status()?.current_state;
        if current == WindowsServiceState::Stopped {
            return Ok(());
        }
        if current != WindowsServiceState::Running && current != WindowsServiceState::Paused {
            bail!(
                "Mimorii Agent cannot stop while it is {}",
                state_name(current)
            );
        }
        service.stop()?;
        wait_for_state(&service, WindowsServiceState::Stopped)
    }

    fn wait_for_state(
        service: &windows_service::service::Service,
        expected: WindowsServiceState,
    ) -> Result<()> {
        let started = std::time::Instant::now();
        loop {
            let current = service.query_status()?.current_state;
            if current == expected {
                return Ok(());
            }
            if started.elapsed() >= CONTROL_TIMEOUT {
                bail!(
                    "Mimorii Agent did not reach {} within {} seconds; current state is {}",
                    state_name(expected),
                    CONTROL_TIMEOUT.as_secs(),
                    state_name(current)
                );
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    fn dispatch_service(_arguments: Vec<OsString>) {
        if let Err(error) = run_service()
            && let Ok(reporter) = FileReporter::new()
        {
            reporter.error(&format!("service failed: {error:#}"));
        }
    }

    fn run_service() -> Result<()> {
        let reporter = FileReporter::new()?;
        let (shutdown_sender, shutdown_receiver) = mpsc::channel();
        let status_slot = Arc::new(Mutex::new(None::<ServiceStatusHandle>));
        let handler_status = status_slot.clone();
        let event_handler = move |event| match event {
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            ServiceControl::Stop | ServiceControl::Shutdown => {
                if let Ok(status) = handler_status.lock()
                    && let Some(handle) = status.as_ref()
                {
                    let _ = handle.set_service_status(service_status(
                        WindowsServiceState::StopPending,
                        ServiceControlAccept::empty(),
                        ServiceExitCode::NO_ERROR,
                        Duration::from_secs(25),
                    ));
                }
                let _ = shutdown_sender.send(());
                ServiceControlHandlerResult::NoError
            }
            _ => ServiceControlHandlerResult::NotImplemented,
        };
        let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;
        *status_slot.lock().unwrap() = Some(status_handle);
        status_handle.set_service_status(service_status(
            WindowsServiceState::Running,
            ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
            ServiceExitCode::NO_ERROR,
            Duration::ZERO,
        ))?;

        crate::runtime::run_until_stopped(shutdown_receiver, &reporter)?;
        status_handle.set_service_status(service_status(
            WindowsServiceState::Stopped,
            ServiceControlAccept::empty(),
            ServiceExitCode::NO_ERROR,
            Duration::ZERO,
        ))?;
        Ok(())
    }

    fn service_status(
        current_state: WindowsServiceState,
        controls_accepted: ServiceControlAccept,
        exit_code: ServiceExitCode,
        wait_hint: Duration,
    ) -> ServiceStatus {
        let checkpoint = match current_state {
            WindowsServiceState::StartPending | WindowsServiceState::StopPending => 1,
            _ => 0,
        };
        ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state,
            controls_accepted,
            exit_code,
            checkpoint,
            wait_hint,
            process_id: None,
        }
    }

    fn map_state(state: WindowsServiceState) -> AgentServiceState {
        match state {
            WindowsServiceState::Stopped => AgentServiceState::Stopped,
            WindowsServiceState::StartPending => AgentServiceState::Starting,
            WindowsServiceState::StopPending => AgentServiceState::Stopping,
            WindowsServiceState::Running => AgentServiceState::Running,
            WindowsServiceState::ContinuePending => AgentServiceState::Continuing,
            WindowsServiceState::PausePending => AgentServiceState::Pausing,
            WindowsServiceState::Paused => AgentServiceState::Paused,
        }
    }

    fn state_name(state: WindowsServiceState) -> &'static str {
        match state {
            WindowsServiceState::Stopped => "stopped",
            WindowsServiceState::StartPending => "starting",
            WindowsServiceState::StopPending => "stopping",
            WindowsServiceState::Running => "running",
            WindowsServiceState::ContinuePending => "continuing",
            WindowsServiceState::PausePending => "pausing",
            WindowsServiceState::Paused => "paused",
        }
    }

    struct FileReporter {
        file: Mutex<File>,
    }

    impl FileReporter {
        fn new() -> Result<Self> {
            let path = crate::config::log_path()?;
            let directory = path.parent().context("agent log path has no parent")?;
            fs::create_dir_all(directory)?;
            if fs::metadata(&path)
                .map(|metadata| metadata.len() >= LOG_LIMIT_BYTES)
                .unwrap_or(false)
            {
                let rotated = path.with_extension("log.1");
                if rotated.exists() {
                    fs::remove_file(&rotated)?;
                }
                fs::rename(&path, rotated)?;
            }
            let file = OpenOptions::new().create(true).append(true).open(path)?;
            Ok(Self {
                file: Mutex::new(file),
            })
        }

        fn write(&self, level: &str, message: &str) {
            if let Ok(mut file) = self.file.lock() {
                let _ = writeln!(file, "{} {level} {message}", crate::time_now());
                let _ = file.flush();
            }
        }
    }

    impl RuntimeReporter for FileReporter {
        fn info(&self, message: &str) {
            self.write("INFO", message);
        }

        fn error(&self, message: &str) {
            self.write("ERROR", message);
        }
    }
}

#[cfg(windows)]
pub use windows::{print_status, run, start, status, stop};

#[cfg(any(target_os = "linux", test))]
fn command(program: &str, arguments: &[&str]) -> Result<()> {
    let status = Command::new(program).args(arguments).status()?;
    if !status.success() {
        bail!("{program} failed with status {status}");
    }
    Ok(())
}

#[cfg(test)]
#[path = "service_tests.rs"]
mod tests;
