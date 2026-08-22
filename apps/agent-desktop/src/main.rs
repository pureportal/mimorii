mod api;
mod checks;
mod collector;
mod config;
mod models;
mod runtime;
mod service;
mod snapshot_store;
mod target_policy;
#[cfg(test)]
mod test_support;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
#[cfg(windows)]
use serde::Serialize;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use api::ApiClient;
use config::AgentConfig;
use runtime::{run_check_runner_loop, run_check_runner_once, run_loop, run_once};

#[cfg(test)]
use runtime::{CollectionWorker, check_runner_cycle, cycle, run_configured_cycle};

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
    Configure {
        #[arg(long)]
        server: String,
        #[arg(long, env = "MIMORII_AGENT_KEY", hide_env_values = true)]
        key: String,
        #[arg(long)]
        allow_insecure_http: bool,
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
        Command::Configure {
            server,
            key,
            allow_insecure_http,
        } => configure(&server, &key, allow_insecure_http),
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
                run_check_runner_once(&config)
            } else {
                run_check_runner_loop(config)
            }
        }
        Command::Run => run_loop(),
        Command::Once => run_once().map(|_| ()),
        Command::Doctor => doctor(),
        Command::Status { json } => status(json),
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
    }
}

fn enroll(server: &str, key: &str, allow_insecure_http: bool) -> Result<()> {
    let config = AgentConfig::new(server, key, allow_insecure_http)?;
    ApiClient::new(config.clone())?.verify()?;
    let path = save_config(&config)?;
    println!("enrolled with {}", config.server_url);
    println!("configuration: {}", path.display());
    Ok(())
}

fn configure(server: &str, key: &str, allow_insecure_http: bool) -> Result<()> {
    let config = AgentConfig::new(server, key, allow_insecure_http)?;
    let path = save_config(&config)?;
    println!("configured with {}", config.server_url);
    println!("configuration: {}", path.display());
    Ok(())
}

fn save_config(config: &AgentConfig) -> Result<std::path::PathBuf> {
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
    ApiClient::new(config)?
        .verify()
        .context("server verification failed")?;
    println!("server: reachable");
    Ok(())
}

fn status(json: bool) -> Result<()> {
    #[cfg(windows)]
    {
        if json {
            println!("{}", serde_json::to_string(&control_status()?)?);
            return Ok(());
        }
        service::print_status()
    }

    #[cfg(not(windows))]
    {
        let _ = json;
        println!("{}", AgentConfig::load()?.public_summary());
        Ok(())
    }
}

#[cfg(windows)]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentControlStatus {
    service: &'static str,
    enrolled: bool,
    server_url: Option<String>,
    configuration_error: Option<String>,
}

#[cfg(windows)]
fn control_status() -> Result<AgentControlStatus> {
    let service = service::status()?.as_str();
    let path = config::config_path()?;
    if !path.exists() {
        return Ok(AgentControlStatus {
            service,
            enrolled: false,
            server_url: None,
            configuration_error: None,
        });
    }
    match AgentConfig::load() {
        Ok(config) => Ok(AgentControlStatus {
            service,
            enrolled: true,
            server_url: Some(config.server_url),
            configuration_error: None,
        }),
        Err(error) => Ok(AgentControlStatus {
            service,
            enrolled: false,
            server_url: None,
            configuration_error: Some(format!("{error:#}")),
        }),
    }
}

pub fn time_now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned())
}

#[cfg(test)]
#[path = "main_tests.rs"]
mod tests;
