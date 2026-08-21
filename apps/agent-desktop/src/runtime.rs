#[cfg(test)]
use std::path::Path;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::thread::{self, sleep};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};

use crate::api::ApiClient;
use crate::config::{AgentConfig, ConfigRefresh, ConfigWatcher, collection_path, config_path};
use crate::models::{AgentTask, HeartbeatRequest, HeartbeatResponse};
use crate::snapshot_store::SnapshotStore;

const DEFAULT_COLLECTION_INTERVAL_SECONDS: u64 = 30;
const MINIMUM_COLLECTION_INTERVAL_SECONDS: u64 = 15;
const MAXIMUM_COLLECTION_INTERVAL_SECONDS: u64 = 3_600;
const TRIGGER_POLL_INTERVAL: Duration = Duration::from_secs(30);
const CONFIGURATION_POLL_INTERVAL: Duration = Duration::from_secs(1);
const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const NATIVE_CAPABILITIES: &[&str] = &["http", "tcp", "dns", "host", "disk"];
const CHECK_RUNNER_CAPABILITIES: &[&str] = &["http", "tcp", "dns"];

pub(crate) trait RuntimeReporter: Send + Sync {
    fn info(&self, message: &str);
    fn error(&self, message: &str);
}

struct ConsoleReporter;

impl RuntimeReporter for ConsoleReporter {
    fn info(&self, message: &str) {
        println!("{message}");
    }

    fn error(&self, message: &str) {
        eprintln!("{message}");
    }
}

pub(crate) fn run_loop() -> Result<()> {
    let (_shutdown_sender, shutdown_receiver) = mpsc::channel();
    run_until_stopped(shutdown_receiver, &ConsoleReporter)
}

pub(crate) fn run_until_stopped(
    shutdown: Receiver<()>,
    reporter: &dyn RuntimeReporter,
) -> Result<()> {
    let mut watcher = ConfigWatcher::new(config_path()?);
    let store = SnapshotStore::new(collection_path()?);
    let mut collection = None;
    let mut next_trigger = Instant::now();
    reporter.info("Mimorii agent started");

    loop {
        match watcher.refresh() {
            ConfigRefresh::Applied => {
                reporter.info("configuration applied");
                next_trigger = Instant::now();
            }
            ConfigRefresh::Rejected(error) if watcher.active().is_some() => reporter.error(
                &format!("configuration update rejected; keeping active configuration: {error}"),
            ),
            ConfigRefresh::Rejected(error) => reporter.error(&format!(
                "configuration unavailable; waiting for a valid configuration: {error}"
            )),
            ConfigRefresh::Unchanged => {}
        }

        if let Some(config) = watcher.active().cloned() {
            if collection.is_none() {
                collection = Some(CollectionWorker::start(store.clone())?);
            }
            if Instant::now() >= next_trigger {
                let worker = collection.as_mut().unwrap();
                match cycle(&config, &store, |seconds| worker.configure(seconds)) {
                    Ok(outcome) => {
                        if let Err(error) = outcome.heartbeat {
                            reporter.error(&format!("trigger transfer failed: {error:#}"));
                        }
                    }
                    Err(error) => reporter.error(&format!("trigger poll failed: {error:#}")),
                }
                worker.ensure_running()?;
                next_trigger = Instant::now() + TRIGGER_POLL_INTERVAL;
            }
        }

        let wait = if watcher.active().is_some() {
            let until_trigger = next_trigger.saturating_duration_since(Instant::now());
            CONFIGURATION_POLL_INTERVAL.min(until_trigger.max(Duration::from_millis(1)))
        } else {
            CONFIGURATION_POLL_INTERVAL
        };
        match shutdown.recv_timeout(wait) {
            Ok(()) | Err(RecvTimeoutError::Disconnected) => {
                reporter.info("Mimorii agent stopped");
                return Ok(());
            }
            Err(RecvTimeoutError::Timeout) => {}
        }
    }
}

#[cfg(test)]
pub(crate) fn run_configured_cycle(
    path: &Path,
    store: &SnapshotStore,
    configure_collection: impl FnOnce(u64) -> Result<()>,
) -> Result<CycleOutcome> {
    let config = AgentConfig::load_from(path)?;
    cycle(&config, store, configure_collection)
}

pub(crate) fn run_once() -> Result<()> {
    let config = AgentConfig::load()?;
    let store = SnapshotStore::new(collection_path()?);
    store.append(&crate::collector::collect())?;
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

pub(crate) fn run_check_runner_loop(config: AgentConfig) -> Result<()> {
    println!("Mimorii check runner started");
    loop {
        match check_runner_cycle(&config) {
            Ok(Some(response)) => println!(
                "trigger accepted at {} with {} result(s)",
                response.accepted_at, response.accepted_results
            ),
            Ok(None) => {}
            Err(error) => eprintln!("check runner cycle failed: {error}"),
        }
        sleep(TRIGGER_POLL_INTERVAL);
    }
}

pub(crate) fn run_check_runner_once(config: &AgentConfig) -> Result<()> {
    match check_runner_cycle(config)? {
        Some(response) => println!(
            "trigger accepted at {} with {} result(s)",
            response.accepted_at, response.accepted_results
        ),
        None => println!("no trigger"),
    }
    Ok(())
}

pub(crate) fn check_runner_cycle(config: &AgentConfig) -> Result<Option<HeartbeatResponse>> {
    let client = ApiClient::new(config.clone())?;
    let registration = client.heartbeat(&HeartbeatRequest {
        agent_version: AGENT_VERSION,
        snapshots: Vec::new(),
        results: Vec::new(),
        capabilities: CHECK_RUNNER_CAPABILITIES.to_vec(),
    })?;
    if registration.accepted_snapshots != 0 || registration.accepted_results != 0 {
        bail!("Mimorii returned an invalid check runner registration response");
    }
    let poll = client.poll(100)?;
    validate_collection_interval(poll.collection_interval_seconds)?;
    if poll.tasks.is_empty() {
        return Ok(None);
    }
    let results = poll
        .tasks
        .iter()
        .map(|task| crate::checks::execute_network(task, &config.target_policy))
        .collect::<Result<Vec<_>>>()?;
    client
        .heartbeat(&HeartbeatRequest {
            agent_version: AGENT_VERSION,
            snapshots: Vec::new(),
            results,
            capabilities: CHECK_RUNNER_CAPABILITIES.to_vec(),
        })
        .map(Some)
}

pub(crate) fn cycle(
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
    let heartbeat = transfer_trigger(&client, &poll.tasks, store, &config.target_policy).map(Some);
    Ok(CycleOutcome { heartbeat })
}

fn transfer_trigger(
    client: &ApiClient,
    tasks: &[AgentTask],
    store: &SnapshotStore,
    target_policy: &crate::target_policy::TargetPolicy,
) -> Result<HeartbeatResponse> {
    let mut batch = store.load()?;
    if batch.is_empty() {
        store.append(&crate::collector::collect())?;
        batch = store.load()?;
    }
    let latest_snapshot = batch.snapshots().last().unwrap();
    let results = tasks
        .iter()
        .map(|task| crate::checks::execute(task, latest_snapshot, target_policy))
        .collect();
    let response = client.heartbeat(&HeartbeatRequest {
        agent_version: AGENT_VERSION,
        snapshots: batch.snapshots().to_vec(),
        results,
        capabilities: NATIVE_CAPABILITIES.to_vec(),
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

pub(crate) struct CycleOutcome {
    pub(crate) heartbeat: Result<Option<HeartbeatResponse>>,
}

pub(crate) struct CollectionWorker {
    pub(crate) interval: Duration,
    pub(crate) interval_sender: Sender<Duration>,
    pub(crate) error_receiver: Receiver<anyhow::Error>,
}

impl CollectionWorker {
    fn start(store: SnapshotStore) -> Result<Self> {
        store.append(&crate::collector::collect())?;
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

    pub(crate) fn configure(&mut self, seconds: u64) -> Result<()> {
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
                if let Err(error) = store.append(&crate::collector::collect()) {
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
