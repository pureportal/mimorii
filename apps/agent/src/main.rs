mod api;
mod checks;
mod collector;
mod config;
mod models;
mod service;
mod snapshot_store;
#[cfg(test)]
mod test_support;

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::thread::{self, sleep};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use api::ApiClient;
use config::{AgentConfig, collection_path, config_path};
use models::{AgentTask, HeartbeatRequest, HeartbeatResponse};
use snapshot_store::SnapshotStore;

#[cfg(test)]
use std::path::Path;

const DEFAULT_COLLECTION_INTERVAL_SECONDS: u64 = 30;
const MINIMUM_COLLECTION_INTERVAL_SECONDS: u64 = 15;
const MAXIMUM_COLLECTION_INTERVAL_SECONDS: u64 = 3_600;
const TRIGGER_POLL_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Parser)]
#[command(
    name = "mimorii-agent",
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
    Run,
    Once,
    Doctor,
    Status,
    Service {
        #[command(subcommand)]
        action: ServiceAction,
    },
}

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
        Command::Run => run_loop(),
        Command::Once => run_once().map(|_| ()),
        Command::Doctor => doctor(),
        Command::Status => status(),
        Command::Service { action } => match action {
            ServiceAction::Install => service::install(&std::env::current_exe()?),
            ServiceAction::Uninstall => service::uninstall(),
        },
    }
}

fn enroll(server: &str, key: &str, allow_insecure_http: bool) -> Result<()> {
    let config = AgentConfig::new(server, key, allow_insecure_http)?;
    ApiClient::new(config.clone())?.verify()?;
    let path = config.save()?;
    println!("enrolled with {}", config.server_url);
    println!("configuration: {}", path.display());
    Ok(())
}

fn configure(server: &str, key: &str, allow_insecure_http: bool) -> Result<()> {
    let config = AgentConfig::new(server, key, allow_insecure_http)?;
    let path = config.save()?;
    println!("configured with {}", config.server_url);
    println!("configuration: {}", path.display());
    Ok(())
}

fn run_loop() -> Result<()> {
    let path = config_path()?;
    let mut config = AgentConfig::load_from(&path)?;
    let store = SnapshotStore::new(collection_path()?);
    let mut collection = CollectionWorker::start(store.clone())?;
    println!("Mimorii agent started");
    loop {
        match cycle(&config, &store, |seconds| collection.configure(seconds)) {
            Ok(outcome) => {
                if let Err(error) = outcome.heartbeat {
                    eprintln!("trigger transfer failed: {error}");
                }
            }
            Err(error) => eprintln!("trigger poll failed: {error}"),
        }
        collection.ensure_running()?;
        sleep(TRIGGER_POLL_INTERVAL);
        config = AgentConfig::load_from(&path)?;
    }
}

#[cfg(test)]
fn run_configured_cycle(
    path: &Path,
    store: &SnapshotStore,
    configure_collection: impl FnOnce(u64) -> Result<()>,
) -> Result<CycleOutcome> {
    let config = AgentConfig::load_from(path)?;
    cycle(&config, store, configure_collection)
}

fn run_once() -> Result<()> {
    let config = AgentConfig::load()?;
    let store = SnapshotStore::new(collection_path()?);
    store.append(&collector::collect())?;
    let outcome = cycle(&config, &store, |_| Ok(()))?;
    match outcome.heartbeat? {
        Some(response) => println!(
            "trigger accepted at {} with {} snapshot(s) and {} result(s)",
            response.accepted_at, response.accepted_snapshots, response.accepted_results
        ),
        None => println!("no trigger; collected data retained locally"),
    }
    Ok(())
}

fn cycle(
    config: &AgentConfig,
    store: &SnapshotStore,
    configure_collection: impl FnOnce(u64) -> Result<()>,
) -> Result<CycleOutcome> {
    let client = ApiClient::new(config.clone())?;
    let poll = client.poll(100)?;
    validate_collection_interval(poll.collection_interval_seconds)?;
    configure_collection(poll.collection_interval_seconds)?;
    if poll.tasks.is_empty() {
        return Ok(CycleOutcome {
            heartbeat: Ok(None),
        });
    }
    let heartbeat = transfer_trigger(&client, &poll.tasks, store).map(Some);
    Ok(CycleOutcome { heartbeat })
}

fn transfer_trigger(
    client: &ApiClient,
    tasks: &[AgentTask],
    store: &SnapshotStore,
) -> Result<HeartbeatResponse> {
    let mut batch = store.load()?;
    if batch.is_empty() {
        store.append(&collector::collect())?;
        batch = store.load()?;
    }
    let latest_snapshot = batch.snapshots().last().unwrap();
    let results = tasks
        .iter()
        .map(|task| checks::execute(task, latest_snapshot))
        .collect();
    let response = client.heartbeat(&HeartbeatRequest {
        snapshots: batch.snapshots().to_vec(),
        results,
        capabilities: vec!["http", "tcp", "dns", "host", "disk"],
    })?;
    if response.accepted_snapshots != batch.snapshots().len() {
        bail!(
            "Mimorii accepted {} of {} collected snapshots",
            response.accepted_snapshots,
            batch.snapshots().len()
        );
    }
    store.acknowledge(&batch)?;
    Ok(response)
}

struct CycleOutcome {
    heartbeat: Result<Option<HeartbeatResponse>>,
}

struct CollectionWorker {
    interval: Duration,
    interval_sender: Sender<Duration>,
    error_receiver: Receiver<anyhow::Error>,
}

impl CollectionWorker {
    fn start(store: SnapshotStore) -> Result<Self> {
        store.append(&collector::collect())?;
        let interval = Duration::from_secs(DEFAULT_COLLECTION_INTERVAL_SECONDS);
        let (interval_sender, interval_receiver) = mpsc::channel();
        let (error_sender, error_receiver) = mpsc::channel();
        thread::spawn(move || collect_locally(store, interval, interval_receiver, error_sender));
        Ok(Self {
            interval,
            interval_sender,
            error_receiver,
        })
    }

    fn configure(&mut self, seconds: u64) -> Result<()> {
        let interval = Duration::from_secs(seconds);
        if interval == self.interval {
            return Ok(());
        }
        self.interval_sender
            .send(interval)
            .context("local collector stopped")?;
        self.interval = interval;
        Ok(())
    }

    fn ensure_running(&self) -> Result<()> {
        match self.error_receiver.try_recv() {
            Ok(error) => Err(error),
            Err(TryRecvError::Empty) => Ok(()),
            Err(TryRecvError::Disconnected) => bail!("local collector stopped"),
        }
    }
}

fn collect_locally(
    store: SnapshotStore,
    mut interval: Duration,
    interval_receiver: Receiver<Duration>,
    error_sender: Sender<anyhow::Error>,
) {
    loop {
        match interval_receiver.recv_timeout(interval) {
            Ok(configured_interval) => interval = configured_interval,
            Err(RecvTimeoutError::Timeout) => {
                if let Err(error) = store.append(&collector::collect()) {
                    let _ = error_sender.send(error);
                    return;
                }
            }
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

fn validate_collection_interval(seconds: u64) -> Result<()> {
    if !(MINIMUM_COLLECTION_INTERVAL_SECONDS..=MAXIMUM_COLLECTION_INTERVAL_SECONDS)
        .contains(&seconds)
    {
        bail!(
            "Mimorii collection interval must be between {MINIMUM_COLLECTION_INTERVAL_SECONDS} and {MAXIMUM_COLLECTION_INTERVAL_SECONDS} seconds"
        );
    }
    Ok(())
}

fn doctor() -> Result<()> {
    let config = AgentConfig::load()?;
    println!("configuration: ok");
    println!("collector: ok");
    println!("{}", config.public_summary());
    ApiClient::new(config)?
        .verify()
        .context("server verification failed")?;
    println!("server: reachable");
    Ok(())
}

fn status() -> Result<()> {
    println!("{}", AgentConfig::load()?.public_summary());
    Ok(())
}

pub fn time_now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned())
}

#[cfg(test)]
#[path = "main_tests.rs"]
mod tests;
