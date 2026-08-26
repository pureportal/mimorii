#[cfg(any(target_os = "linux", test))]
use std::path::{Path, PathBuf};
#[cfg(any(target_os = "linux", test))]
use std::process::{Command, Output};

#[cfg(any(target_os = "linux", test))]
use anyhow::{Context, Result, bail};

#[cfg(target_os = "linux")]
const LINUX_SERVICE_NAME: &str = "mimorii-agent-desktop.service";

#[cfg(any(target_os = "linux", test))]
struct LinuxServicePaths {
    home: PathBuf,
    config_home: PathBuf,
    data_home: PathBuf,
    collection: PathBuf,
}

#[cfg(target_os = "linux")]
impl LinuxServicePaths {
    fn discover() -> Result<Self> {
        let directories = directories::BaseDirs::new()
            .ok_or_else(|| anyhow::anyhow!("could not determine the user home directory"))?;
        Ok(Self {
            home: directories.home_dir().to_path_buf(),
            config_home: directories.config_dir().to_path_buf(),
            data_home: directories.data_local_dir().to_path_buf(),
            collection: crate::config::collection_path()?,
        })
    }

    fn unit(&self) -> PathBuf {
        self.config_home
            .join("systemd/user")
            .join(LINUX_SERVICE_NAME)
    }
}

#[cfg(target_os = "linux")]
pub fn install(executable: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    if let Some(warning) = service_installation_warning(crate::linux::running_as_root()) {
        eprintln!("{warning}");
    }

    let paths = LinuxServicePaths::discover()?;
    let unit = paths.unit();
    let directory = unit
        .parent()
        .ok_or_else(|| anyhow::anyhow!("could not determine the systemd user directory"))?;
    std::fs::create_dir_all(directory)?;
    std::fs::create_dir_all(&paths.collection)?;
    std::fs::set_permissions(&paths.collection, std::fs::Permissions::from_mode(0o700))?;
    write_unit(&unit, &systemd_user_unit_content(executable, &paths)?)?;
    let user_id = current_user_id()?;
    ensure_linger_enabled(&user_id)?;
    systemctl_user(&user_id, &["daemon-reload"])?;
    systemctl_user(&user_id, &["reset-failed", LINUX_SERVICE_NAME])?;
    systemctl_user(&user_id, &["enable", LINUX_SERVICE_NAME])?;
    systemctl_user(&user_id, &["restart", LINUX_SERVICE_NAME])?;
    systemctl_user(&user_id, &["is-active", "--quiet", LINUX_SERVICE_NAME])?;
    println!("installed {}", unit.display());
    println!("service: running");
    Ok(())
}

#[cfg(any(target_os = "linux", test))]
fn service_installation_warning(running_as_root: bool) -> Option<&'static str> {
    running_as_root.then_some(
        "Warning: Installing the service as root; it will use root's enrolled configuration",
    )
}

#[cfg(any(target_os = "linux", test))]
fn linger_requires_sudo(user_id: &str) -> bool {
    user_id != "0"
}

#[cfg(target_os = "linux")]
pub fn uninstall() -> Result<()> {
    let user_id = current_user_id()?;
    let _ = systemctl_user(&user_id, &["disable", "--now", LINUX_SERVICE_NAME]);
    let unit = systemd_user_unit()?;
    if unit.exists() {
        std::fs::remove_file(unit)?;
    }
    systemctl_user(&user_id, &["daemon-reload"])?;
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn restart_if_installed() -> Result<()> {
    if systemd_user_unit()?.is_file() {
        let user_id = current_user_id()?;
        systemctl_user(&user_id, &["reset-failed", LINUX_SERVICE_NAME])?;
        systemctl_user(&user_id, &["restart", LINUX_SERVICE_NAME])?;
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn systemd_user_unit() -> Result<PathBuf> {
    Ok(LinuxServicePaths::discover()?.unit())
}

#[cfg(any(target_os = "linux", test))]
fn systemd_user_unit_content(executable: &Path, paths: &LinuxServicePaths) -> Result<String> {
    let executable = systemd_path(executable, true)?;
    let home = systemd_environment_path("HOME", &paths.home)?;
    let config_home = systemd_environment_path("XDG_CONFIG_HOME", &paths.config_home)?;
    let data_home = systemd_environment_path("XDG_DATA_HOME", &paths.data_home)?;
    let collection = systemd_path(&paths.collection, false)?;
    Ok(format!(
        "[Unit]\nDescription=Mimorii desktop monitoring agent\n\n[Service]\nType=exec\nExecStart={executable} run\nEnvironment={home}\nEnvironment={config_home}\nEnvironment={data_home}\nRestart=on-failure\nRestartSec=10s\nTimeoutStopSec=30s\nUMask=0077\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=read-only\nReadWritePaths={collection}\nStandardOutput=journal\nStandardError=journal\nSyslogIdentifier=mimorii-agent-desktop\n\n[Install]\nWantedBy=default.target\n"
    ))
}

#[cfg(any(target_os = "linux", test))]
fn systemd_environment_path(name: &str, path: &Path) -> Result<String> {
    let path = absolute_utf8_path(path)?;
    systemd_quote(&format!("{name}={path}"), false)
}

#[cfg(any(target_os = "linux", test))]
fn systemd_path(path: &Path, escape_dollars: bool) -> Result<String> {
    systemd_quote(absolute_utf8_path(path)?, escape_dollars)
}

#[cfg(any(target_os = "linux", test))]
fn absolute_utf8_path(path: &Path) -> Result<&str> {
    if !path.is_absolute() {
        bail!("systemd service paths must be absolute: {}", path.display());
    }
    path.to_str()
        .with_context(|| format!("systemd service path is not UTF-8: {}", path.display()))
}

#[cfg(any(target_os = "linux", test))]
fn systemd_quote(value: &str, escape_dollars: bool) -> Result<String> {
    if value.chars().any(char::is_control) {
        bail!("systemd service values cannot contain control characters");
    }
    let mut escaped = String::with_capacity(value.len() + 2);
    escaped.push('"');
    for character in value.chars() {
        match character {
            '\\' | '"' => {
                escaped.push('\\');
                escaped.push(character);
            }
            '%' => escaped.push_str("%%"),
            '$' if escape_dollars => escaped.push_str("$$"),
            _ => escaped.push(character),
        }
    }
    escaped.push('"');
    Ok(escaped)
}

#[cfg(target_os = "linux")]
fn write_unit(path: &Path, content: &str) -> Result<()> {
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;

    let directory = path.parent().context("systemd unit path has no parent")?;
    let mut staged = tempfile::Builder::new()
        .prefix(".mimorii-agent-service-")
        .tempfile_in(directory)
        .context("could not stage the systemd user service")?;
    staged.write_all(content.as_bytes())?;
    staged.as_file_mut().sync_all()?;
    staged
        .as_file()
        .set_permissions(std::fs::Permissions::from_mode(0o644))?;
    staged
        .persist(path)
        .map_err(|error| error.error)
        .with_context(|| {
            format!(
                "could not install systemd user service at {}",
                path.display()
            )
        })?;
    std::fs::File::open(directory)?.sync_all()?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn current_user_id() -> Result<String> {
    let user_id = command_output("id", &["--user"])?;
    let user_id = user_id.trim();
    if user_id.is_empty() || !user_id.chars().all(|character| character.is_ascii_digit()) {
        bail!("could not determine the current numeric user ID");
    }
    Ok(user_id.to_owned())
}

#[cfg(target_os = "linux")]
fn ensure_linger_enabled(user_id: &str) -> Result<()> {
    if linger_requires_sudo(user_id) {
        if linger_enabled(user_id)? {
            return Ok(());
        }
        command("sudo", &["--", "loginctl", "enable-linger", user_id])?;
    } else {
        command("loginctl", &["enable-linger", user_id])?;
    }
    if !linger_enabled(user_id)? {
        bail!("systemd user lingering was not enabled for user ID {user_id}");
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn linger_enabled(user_id: &str) -> Result<bool> {
    Ok(command_output(
        "loginctl",
        &["show-user", user_id, "--property=Linger", "--value"],
    )?
    .trim()
    .eq_ignore_ascii_case("yes"))
}

#[cfg(any(target_os = "linux", test))]
fn systemd_user_runtime_directory(user_id: &str) -> PathBuf {
    Path::new("/run/user").join(user_id)
}

#[cfg(target_os = "linux")]
fn systemctl_user(user_id: &str, arguments: &[&str]) -> Result<()> {
    checked_command_output("systemctl", systemctl_user_command(user_id, arguments)).map(|_| ())
}

#[cfg(any(target_os = "linux", test))]
fn systemctl_user_command(user_id: &str, arguments: &[&str]) -> Command {
    let mut process = Command::new("systemctl");
    process
        .arg("--user")
        .args(arguments)
        .env("XDG_RUNTIME_DIR", systemd_user_runtime_directory(user_id))
        .env_remove("DBUS_SESSION_BUS_ADDRESS");
    process
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
    checked_output(program, arguments).map(|_| ())
}

#[cfg(target_os = "linux")]
fn command_output(program: &str, arguments: &[&str]) -> Result<String> {
    String::from_utf8(checked_output(program, arguments)?.stdout)
        .with_context(|| format!("{program} returned non-UTF-8 output"))
}

#[cfg(any(target_os = "linux", test))]
fn checked_output(program: &str, arguments: &[&str]) -> Result<Output> {
    let mut process = Command::new(program);
    process.args(arguments);
    checked_command_output(program, process)
}

#[cfg(any(target_os = "linux", test))]
fn checked_command_output(program: &str, mut process: Command) -> Result<Output> {
    let output = process
        .output()
        .with_context(|| format!("could not run {program}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        if detail.is_empty() {
            bail!("{program} failed with status {}", output.status);
        }
        bail!("{program} failed with status {}: {detail}", output.status);
    }
    Ok(output)
}

#[cfg(test)]
#[path = "service_tests.rs"]
mod tests;
