mod activity;
mod api;
mod checks;
mod collector;
mod config;
mod config_command;
mod containers;
mod database;
mod doctor;
mod favicon;
mod host_check;
mod host_maintenance;
mod icmp;
#[cfg(target_os = "linux")]
mod linux;
mod logs;
mod models;
mod runtime;
mod runtime_state;
mod service;
mod service_state;
mod snapshot_store;
mod status_command;
mod target_policy;
mod terminal;
#[cfg(test)]
mod test_support;
mod update;

use anyhow::{Context, Result};
use clap::{CommandFactory, Parser, Subcommand};
use clap_complete::Shell;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use api::ApiClient;
use config::AgentConfig;
#[cfg(test)]
use config_command::apply_config_options;
use config_command::{ConfigOptions, configure};
use runtime::{run_check_runner_loop, run_check_runner_once, run_loop, run_once};

#[cfg(test)]
use runtime::{CollectionWorker, check_runner_cycle, cycle, execute_tasks, run_configured_cycle};

#[derive(Parser)]
#[command(
    name = "mimorii-agent-desktop",
    version,
    about = "Mimorii monitoring agent for servers and desktops",
    after_help = "Start with `mimorii-agent-desktop status`, or `mimorii-agent-desktop doctor` when something looks wrong."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Connect this computer to a Mimorii server
    Enroll {
        /// Mimorii API URL, for example https://mimorii.example.com/api
        #[arg(long, value_name = "URL")]
        server: String,
        /// Enrollment key created in Mimorii
        #[arg(
            long,
            env = "MIMORII_AGENT_KEY",
            hide_env_values = true,
            value_name = "KEY"
        )]
        key: String,
        /// Allow an http:// server URL
        #[arg(long)]
        allow_insecure_http: bool,
    },
    /// Choose which network targets this agent may check
    Config {
        #[command(flatten)]
        options: ConfigOptions,
    },
    /// Show the connection, service, and upload status
    Status {
        /// Print machine-readable JSON
        #[arg(long)]
        json: bool,
        /// Refresh continuously until Ctrl+C
        #[arg(long, short, conflicts_with = "json")]
        watch: bool,
    },
    /// Diagnose enrollment, connectivity, and service health
    Doctor {
        /// Print machine-readable JSON
        #[arg(long)]
        json: bool,
    },
    /// Show checks this agent ran recently
    Activity {
        /// Print machine-readable JSON
        #[arg(long)]
        json: bool,
        /// Number of checks to show
        #[arg(long, short = 'n', default_value_t = 20, value_name = "COUNT")]
        limit: usize,
    },
    /// Show the agent log
    #[cfg(any(windows, target_os = "linux"))]
    Logs {
        /// Number of lines to show
        #[arg(long, short = 'n', default_value_t = 50, value_name = "COUNT")]
        lines: usize,
        /// Keep printing new entries until Ctrl+C
        #[arg(long, short)]
        follow: bool,
    },
    /// Run the agent in the foreground
    Run,
    /// Run a single collection and check cycle
    Once,
    /// Run network checks without collecting host telemetry
    CheckRunner {
        /// Mimorii API URL
        #[arg(long, env = "MIMORII_AGENT_SERVER", value_name = "URL")]
        server: String,
        /// Enrollment key created in Mimorii
        #[arg(
            long,
            env = "MIMORII_AGENT_KEY",
            hide_env_values = true,
            value_name = "KEY"
        )]
        key: String,
        /// Allow an http:// server URL
        #[arg(
            long,
            env = "MIMORII_AGENT_ALLOW_INSECURE_HTTP",
            default_value_t = false
        )]
        allow_insecure_http: bool,
        /// Comma-separated CIDRs the runner may reach
        #[arg(
            long,
            env = "MIMORII_AGENT_ALLOWED_CIDRS",
            default_value = "",
            value_name = "CIDRS"
        )]
        allowed_cidrs: String,
        /// Run a single cycle and exit
        #[arg(long)]
        once: bool,
    },
    /// Check for and install agent updates
    Update {
        /// Only report whether an update is available
        #[arg(long)]
        check: bool,
        /// Print machine-readable JSON
        #[arg(long)]
        json: bool,
        #[arg(long, hide = true)]
        privileged: bool,
    },
    /// Print a shell completion script
    Completions {
        /// Shell to generate completions for
        shell: Shell,
    },
    /// Manage the systemd user service
    #[cfg(target_os = "linux")]
    Service {
        #[command(subcommand)]
        action: ServiceAction,
    },
    #[cfg(windows)]
    #[command(hide = true)]
    WindowsService,
    #[cfg(windows)]
    #[command(hide = true)]
    WindowsServiceControl {
        #[command(subcommand)]
        action: WindowsServiceControlAction,
    },
    #[cfg(windows)]
    #[command(hide = true)]
    ApplyUpdate {
        #[arg(long)]
        package: std::path::PathBuf,
        #[arg(long)]
        sha256: String,
        #[arg(long)]
        parent_pid: u32,
    },
}

#[cfg(windows)]
#[derive(Subcommand)]
enum WindowsServiceControlAction {
    Start,
    Stop,
}

#[cfg(target_os = "linux")]
#[derive(Subcommand)]
enum ServiceAction {
    /// Install, enable, and start the service
    Install,
    /// Stop, disable, and remove the service
    Uninstall,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Enroll {
            server,
            key,
            allow_insecure_http,
        } => enroll(&server, &key, allow_insecure_http),
        Command::Config { options } => configure(options),
        Command::Status { json, watch } => status_command::show(json, watch),
        Command::Doctor { json } => doctor::run(json),
        Command::Activity { json, limit } => activity::show(json, limit),
        #[cfg(any(windows, target_os = "linux"))]
        Command::Logs { lines, follow } => logs::show(lines, follow),
        Command::Run => run_loop(),
        Command::Once => run_once(),
        Command::CheckRunner {
            server,
            key,
            allow_insecure_http,
            allowed_cidrs,
            once,
        } => {
            let config =
                AgentConfig::new_check_runner(&server, &key, allow_insecure_http, &allowed_cidrs)?;
            if once {
                run_check_runner_once(config)
            } else {
                run_check_runner_loop(config)
            }
        }
        Command::Update {
            check,
            json,
            privileged,
        } => update::run(check, json, privileged),
        Command::Completions { shell } => {
            let mut command = Cli::command();
            let name = command.get_name().to_owned();
            clap_complete::generate(shell, &mut command, name, &mut std::io::stdout());
            Ok(())
        }
        #[cfg(target_os = "linux")]
        Command::Service { action } => match action {
            ServiceAction::Install => service::install(&std::env::current_exe()?),
            ServiceAction::Uninstall => service::uninstall(),
        },
        #[cfg(windows)]
        Command::WindowsService => service::run(),
        #[cfg(windows)]
        Command::WindowsServiceControl { action } => match action {
            WindowsServiceControlAction::Start => service::start(),
            WindowsServiceControlAction::Stop => service::stop(),
        },
        #[cfg(windows)]
        Command::ApplyUpdate {
            package,
            sha256,
            parent_pid,
        } => update::apply_windows(package, &sha256, parent_pid),
    }
}

fn enroll(server: &str, key: &str, allow_insecure_http: bool) -> Result<()> {
    let mut config = AgentConfig::new(server, key, allow_insecure_http)?;
    if let Ok(existing) = AgentConfig::load() {
        config.target_policy = existing.target_policy;
    }
    ApiClient::new(config.clone())?.verify()?;
    let path = save_config(&config)?;
    anstream::println!(
        "{}\n{}",
        terminal::success(format!("Enrolled with {}", config.server_url)),
        terminal::fields(&[("Configuration", path.display().to_string())])
    );
    #[cfg(target_os = "linux")]
    service::install(&std::env::current_exe()?).context(
        "enrollment succeeded, but the Linux agent service could not be installed or started; fix the reported issue, then run `mimorii-agent-desktop service install`",
    )?;
    anstream::println!(
        "\n  Check the connection with {}",
        terminal::command("mimorii-agent-desktop doctor")
    );
    Ok(())
}

pub(crate) fn save_config(config: &AgentConfig) -> Result<std::path::PathBuf> {
    #[cfg(windows)]
    return config.save().context(
        "could not update the machine configuration; run this command from an administrator terminal",
    );

    #[cfg(not(windows))]
    return config.save();
}

pub fn time_now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned())
}

#[cfg(test)]
#[path = "main_tests.rs"]
mod tests;
