mod api;
mod checks;
mod collector;
mod config;
mod config_command;
mod containers;
mod database;
mod favicon;
mod host_check;
mod host_maintenance;
mod icmp;
#[cfg(target_os = "linux")]
mod linux;
mod models;
mod runtime;
mod runtime_state;
mod service;
mod snapshot_store;
mod target_policy;
#[cfg(test)]
mod test_support;
mod update;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use serde::Serialize;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use api::ApiClient;
use config::AgentConfig;
#[cfg(test)]
use config_command::apply_config_options;
use config_command::{ConfigOptions, configure};
use runtime::{run_check_runner_loop, run_check_runner_once, run_loop, run_once};
use runtime_state::{RuntimeState, RuntimeSummary, unix_now};
use target_policy::TargetPolicy;

#[cfg(test)]
use runtime::{CollectionWorker, check_runner_cycle, cycle, execute_tasks, run_configured_cycle};

#[derive(Parser)]
#[command(
    name = "mimorii-agent-desktop",
    version,
    about = "Mimorii read-only monitoring agent"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Enroll {
        #[arg(long)]
        server: String,
        #[arg(long, env = "MIMORII_AGENT_KEY", hide_env_values = true)]
        key: String,
        #[arg(long)]
        allow_insecure_http: bool,
    },
    Config {
        #[command(flatten)]
        options: ConfigOptions,
    },
    CheckRunner {
        #[arg(long, env = "MIMORII_AGENT_SERVER")]
        server: String,
        #[arg(long, env = "MIMORII_AGENT_KEY", hide_env_values = true)]
        key: String,
        #[arg(
            long,
            env = "MIMORII_AGENT_ALLOW_INSECURE_HTTP",
            default_value_t = false
        )]
        allow_insecure_http: bool,
        #[arg(long, env = "MIMORII_AGENT_ALLOWED_CIDRS", default_value = "")]
        allowed_cidrs: String,
        #[arg(long)]
        once: bool,
    },
    Run,
    Once,
    Doctor,
    Status {
        #[arg(long)]
        json: bool,
    },
    Update {
        #[arg(long)]
        check: bool,
        #[arg(long)]
        json: bool,
        #[arg(long, hide = true)]
        privileged: bool,
    },
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
    Install,
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
        Command::Run => run_loop(),
        Command::Once => run_once().map(|_| ()),
        Command::Doctor => doctor(),
        Command::Status { json } => status(json),
        Command::Update {
            check,
            json,
            privileged,
        } => update::run(check, json, privileged),
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
    println!("enrolled with {}", config.server_url);
    println!("configuration: {}", path.display());
    #[cfg(target_os = "linux")]
    service::install(&std::env::current_exe()?).context(
        "enrollment succeeded, but the Linux agent service could not be installed or started; fix the reported issue, then run `mimorii-agent-desktop service install`",
    )?;
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

fn doctor() -> Result<()> {
    let config = AgentConfig::load()?;
    println!("configuration: ok");
    println!("agent: ok");
    println!("{}", config.public_summary());
    if let Some(summary) = runtime_summary()? {
        for line in summary.lines() {
            println!("{line}");
        }
    }
    ApiClient::new(config)?
        .verify()
        .context("server verification failed")?;
    println!("server: reachable");
    Ok(())
}

fn status(json: bool) -> Result<()> {
    let status = control_status()?;
    if json {
        println!("{}", serde_json::to_string(&status)?);
        return Ok(());
    }
    #[cfg(windows)]
    println!("service: {}", status.service);
    match (&status.server_url, &status.configuration_error) {
        (Some(server_url), _) => {
            println!("server: {server_url}");
            println!("credential: enrolled");
        }
        (None, Some(error)) => println!("configuration: {error}"),
        (None, None) => println!("credential: not enrolled"),
    }
    if let Some(runtime) = &status.runtime {
        for line in runtime.lines() {
            println!("{line}");
        }
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentControlStatus {
    #[cfg(windows)]
    service: &'static str,
    enrolled: bool,
    server_url: Option<String>,
    target_policy: Option<TargetPolicy>,
    configuration_error: Option<String>,
    runtime: Option<RuntimeSummary>,
    #[cfg(windows)]
    log_path: String,
}

fn control_status() -> Result<AgentControlStatus> {
    #[cfg(windows)]
    let service = service::status()?.as_str();
    let runtime = runtime_summary().ok().flatten();
    let path = config::config_path()?;
    let (enrolled, server_url, target_policy, configuration_error) = if !path.exists() {
        (false, None, None, None)
    } else {
        match AgentConfig::load() {
            Ok(config) => (
                true,
                Some(config.server_url),
                Some(config.target_policy),
                None,
            ),
            Err(error) => (false, None, None, Some(format!("{error:#}"))),
        }
    };
    Ok(AgentControlStatus {
        #[cfg(windows)]
        service,
        enrolled,
        server_url,
        target_policy,
        configuration_error,
        runtime,
        #[cfg(windows)]
        log_path: config::log_path()?.display().to_string(),
    })
}

fn runtime_summary() -> Result<Option<RuntimeSummary>> {
    Ok(RuntimeState::load(&config::state_path()?)?.map(|state| state.summary(unix_now())))
}

pub fn time_now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned())
}

#[cfg(test)]
#[path = "main_tests.rs"]
mod tests;
