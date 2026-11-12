#[cfg(test)]
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::thread::{self, sleep};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};

use crate::activity::{self, CheckActivity};
use crate::api::{ApiClient, PayloadRejected};
use crate::config::{
    AgentConfig, ConfigRefresh, ConfigWatcher, collection_path, config_path, state_path,
};
use crate::models::{AgentTask, HeartbeatRequest, HeartbeatResponse, TaskResult};
use crate::runtime_state::RuntimeStatus;
use crate::snapshot_store::SnapshotStore;
use crate::terminal::{self, Tone};

const DEFAULT_COLLECTION_INTERVAL_SECONDS: u64 = 30;
const MINIMUM_COLLECTION_INTERVAL_SECONDS: u64 = 15;
const MAXIMUM_COLLECTION_INTERVAL_SECONDS: u64 = 3_600;
const TRIGGER_POLL_INTERVAL: Duration = Duration::from_secs(30);
const CONFIGURATION_POLL_INTERVAL: Duration = Duration::from_secs(1);
const TASK_CONCURRENCY: usize = 8;
const MAX_UPLOAD_BATCHES_PER_CYCLE: usize = 10;
const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const NATIVE_CAPABILITIES: &[&str] = &[
    "http", "tcp", "dns", "icmp", "wan", "host", "disk", "docker", "database",
];
const CHECK_RUNNER_CAPABILITIES: &[&str] = &["http", "tcp", "dns", "icmp", "wan", "database"];

pub(crate) trait RuntimeReporter: Send + Sync {
    fn info(&self, message: &str);
    fn error(&self, message: &str);
}

struct ConsoleReporter;

impl RuntimeReporter for ConsoleReporter {
    fn info(&self, message: &str) {
        anstream::println!("{} {message}", timestamp());
    }

    fn error(&self, message: &str) {
        anstream::eprintln!(
            "{} {}",
            timestamp(),
            terminal::tinted(Tone::Danger, message)
        );
    }
}

fn timestamp() -> String {
    terminal::paint(terminal::MUTED, crate::time_now())
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
    let mut status = RuntimeStatus::new(state_path()?, reporter);
    let mut client = None;
    let mut collection = None;
    let mut next_trigger = Instant::now();
    reporter.info("Mimorii agent started");

    loop {
        match watcher.refresh() {
            ConfigRefresh::Applied => {
                reporter.info("configuration applied");
                client = match watcher.active().cloned().map(ApiClient::new).transpose() {
                    Ok(client) => client,
                    Err(error) => {
                        status.failed(&format!(
                            "could not prepare the server connection: {error:#}"
                        ));
                        None
                    }
                };
                next_trigger = Instant::now();
            }
            ConfigRefresh::Rejected(error) if watcher.active().is_some() => status.failed(
                &format!("configuration update rejected; keeping active configuration: {error}"),
            ),
            ConfigRefresh::Rejected(error) => {
                status.failed(&format!(
                    "configuration unavailable; waiting for a valid configuration: {error}"
                ));
                status.persist();
            }
            ConfigRefresh::Unchanged => {}
        }

        if let Some(client) = client.as_ref()
            && Instant::now() >= next_trigger
        {
            let worker = match collection.as_mut() {
                Some(worker) => worker,
                None => collection.insert(CollectionWorker::start(store.clone())?),
            };
            record_cycle(
                &mut status,
                cycle(client, &store, |seconds, enabled| {
                    worker.configure(seconds, enabled)
                }),
            );
            for error in worker.take_errors()? {
                status.failed(&format!("local collection failed: {error:#}"));
            }
            match store.pending() {
                Ok(count) => status.set_pending_snapshots(count),
                Err(error) => status.failed(&format!("local collection is unreadable: {error:#}")),
            }
            status.persist();
            next_trigger = Instant::now() + TRIGGER_POLL_INTERVAL;
        }

        let wait = if client.is_some() {
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

fn record_cycle(status: &mut RuntimeStatus<'_>, outcome: Result<CycleOutcome>) {
    match outcome {
        Ok(outcome) => {
            status.contacted();
            status.record_checks(outcome.checks);
            match outcome.heartbeat {
                Ok(Some(_)) => {
                    status.uploaded();
                    status.succeeded();
                }
                Ok(None) => status.succeeded(),
                Err(error) => status.failed(&format!("trigger transfer failed: {error:#}")),
            }
        }
        Err(error) => status.failed(&format!("trigger poll failed: {error:#}")),
    }
}

#[cfg(test)]
pub(crate) fn run_configured_cycle(
    path: &Path,
    store: &SnapshotStore,
    configure_collection: impl FnOnce(u64, bool) -> Result<()>,
) -> Result<CycleOutcome> {
    let client = ApiClient::new(AgentConfig::load_from(path)?)?;
    cycle(&client, store, configure_collection)
}

pub(crate) fn run_once() -> Result<()> {
    let client = ApiClient::new(AgentConfig::load()?)?;
    let store = SnapshotStore::new(collection_path()?);
    let outcome = cycle(&client, &store, |_, enabled| {
        if enabled {
            store.append(&crate::collector::collect()?)?;
        }
        Ok(())
    })?;
    match outcome.heartbeat? {
        Some(response) => anstream::println!(
            "{}",
            terminal::success(format!(
                "Uploaded {} and {} at {}",
                terminal::count(response.accepted_snapshots, "snapshot", "snapshots"),
                terminal::count(response.accepted_results, "check result", "check results"),
                response.accepted_at
            ))
        ),
        None => anstream::println!(
            "{} No checks requested; collected data stays queued locally",
            terminal::mark(Tone::Neutral)
        ),
    }
    Ok(())
}

pub(crate) fn run_check_runner_loop(config: AgentConfig) -> Result<()> {
    let client = ApiClient::new(config)?;
    let reporter = ConsoleReporter;
    reporter.info("Mimorii check runner started");
    loop {
        match check_runner_cycle(&client) {
            Ok(Some(response)) => reporter.info(&check_runner_summary(&response)),
            Ok(None) => {}
            Err(error) => reporter.error(&format!("check runner cycle failed: {error:#}")),
        }
        sleep(TRIGGER_POLL_INTERVAL);
    }
}

pub(crate) fn run_check_runner_once(config: AgentConfig) -> Result<()> {
    match check_runner_cycle(&ApiClient::new(config)?)? {
        Some(response) => {
            anstream::println!("{}", terminal::success(check_runner_summary(&response)))
        }
        None => anstream::println!("{} No checks requested", terminal::mark(Tone::Neutral)),
    }
    Ok(())
}

fn check_runner_summary(response: &HeartbeatResponse) -> String {
    format!(
        "Uploaded {} at {}",
        terminal::count(response.accepted_results, "check result", "check results"),
        response.accepted_at
    )
}

pub(crate) fn check_runner_cycle(client: &ApiClient) -> Result<Option<HeartbeatResponse>> {
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
    let policy = &client.config().target_policy;
    let results = execute_tasks(&poll.tasks, |task| {
        crate::checks::execute_network(task, policy)
    })
    .into_iter()
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
    client: &ApiClient,
    store: &SnapshotStore,
    configure_collection: impl FnOnce(u64, bool) -> Result<()>,
) -> Result<CycleOutcome> {
    let poll = client.poll(100)?;
    validate_collection_interval(poll.collection_interval_seconds)?;
    configure_collection(
        poll.collection_interval_seconds,
        poll.collect_host_telemetry,
    )?;
    let policy = &client.config().target_policy;
    if !poll.collect_host_telemetry {
        store.clear()?;
        if poll.tasks.is_empty() {
            return Ok(CycleOutcome {
                heartbeat: Ok(None),
                checks: Vec::new(),
            });
        }
        let snapshot = crate::collector::collect()?;
        let results = execute_tasks(&poll.tasks, |task| {
            crate::checks::execute(task, &snapshot, policy)
        });
        let checks = activity::record(&poll.tasks, &results);
        let heartbeat = client
            .heartbeat(&HeartbeatRequest {
                agent_version: AGENT_VERSION,
                snapshots: Vec::new(),
                results,
                capabilities: NATIVE_CAPABILITIES.to_vec(),
            })
            .map(Some);
        return Ok(CycleOutcome { heartbeat, checks });
    }
    if poll.tasks.is_empty() && store.pending()? == 0 {
        return Ok(CycleOutcome {
            heartbeat: Ok(None),
            checks: Vec::new(),
        });
    }
    let mut checks = Vec::new();
    let heartbeat = transfer_trigger(client, &poll.tasks, store, &mut checks).map(Some);
    Ok(CycleOutcome { heartbeat, checks })
}

fn transfer_trigger(
    client: &ApiClient,
    tasks: &[AgentTask],
    store: &SnapshotStore,
    checks: &mut Vec<CheckActivity>,
) -> Result<HeartbeatResponse> {
    if store.pending()? == 0 {
        store.append(&crate::collector::collect()?)?;
    }
    let latest_snapshot = store
        .latest()?
        .context("collected telemetry is unavailable")?;
    let policy = &client.config().target_policy;
    let results = execute_tasks(tasks, |task| {
        crate::checks::execute(task, &latest_snapshot, policy)
    });
    *checks = activity::record(tasks, &results);
    let mut response = upload_batch(client, store, results)?;
    for _ in 1..MAX_UPLOAD_BATCHES_PER_CYCLE {
        if store.pending()? == 0 {
            break;
        }
        let next = upload_batch(client, store, Vec::new())?;
        response.accepted_at = next.accepted_at;
        response.accepted_snapshots += next.accepted_snapshots;
    }
    Ok(response)
}

fn upload_batch(
    client: &ApiClient,
    store: &SnapshotStore,
    results: Vec<TaskResult>,
) -> Result<HeartbeatResponse> {
    let batch = store.load()?;
    let response = match client.heartbeat(&HeartbeatRequest {
        agent_version: AGENT_VERSION,
        snapshots: batch.snapshots().to_vec(),
        results,
        capabilities: NATIVE_CAPABILITIES.to_vec(),
    }) {
        Err(error) if error.is::<PayloadRejected>() => {
            store.acknowledge(&batch)?;
            return Err(error.context(format!(
                "discarded {} snapshot(s) that Mimorii cannot accept",
                batch.snapshots().len()
            )));
        }
        result => result?,
    };
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

pub(crate) fn execute_tasks<T: Sync, R: Send>(
    tasks: &[T],
    execute: impl Fn(&T) -> R + Sync,
) -> Vec<R> {
    let next = AtomicUsize::new(0);
    let mut completed = thread::scope(|scope| {
        let workers = (0..TASK_CONCURRENCY.min(tasks.len()))
            .map(|_| {
                scope.spawn(|| {
                    let mut completed = Vec::new();
                    loop {
                        let index = next.fetch_add(1, Ordering::Relaxed);
                        let Some(task) = tasks.get(index) else {
                            return completed;
                        };
                        completed.push((index, execute(task)));
                    }
                })
            })
            .collect::<Vec<_>>();
        workers
            .into_iter()
            .flat_map(|worker| worker.join().expect("a check worker panicked"))
            .collect::<Vec<_>>()
    });
    completed.sort_by_key(|(index, _)| *index);
    completed.into_iter().map(|(_, result)| result).collect()
}

pub(crate) struct CycleOutcome {
    pub(crate) heartbeat: Result<Option<HeartbeatResponse>>,
    pub(crate) checks: Vec<CheckActivity>,
}

pub(crate) struct CollectionWorker {
    pub(crate) interval: Duration,
    pub(crate) enabled: bool,
    command_sender: Sender<CollectionCommand>,
    error_receiver: Receiver<anyhow::Error>,
}

struct CollectionCommand {
    interval: Duration,
    enabled: bool,
    applied: Sender<()>,
}

impl CollectionWorker {
    pub(crate) fn start(store: SnapshotStore) -> Result<Self> {
        let interval = Duration::from_secs(DEFAULT_COLLECTION_INTERVAL_SECONDS);
        let (command_sender, command_receiver) = mpsc::channel();
        let (error_sender, error_receiver) = mpsc::channel();
        thread::spawn(move || collect_locally(store, command_receiver, error_sender));
        Ok(Self {
            interval,
            enabled: false,
            command_sender,
            error_receiver,
        })
    }

    pub(crate) fn configure(&mut self, seconds: u64, enabled: bool) -> Result<()> {
        let interval = Duration::from_secs(seconds);
        if interval == self.interval && enabled == self.enabled {
            return Ok(());
        }
        let (applied, confirmation) = mpsc::channel();
        self.command_sender
            .send(CollectionCommand {
                interval,
                enabled,
                applied,
            })
            .context("local agent stopped")?;
        confirmation.recv().context("local agent stopped")?;
        self.interval = interval;
        self.enabled = enabled;
        Ok(())
    }

    fn take_errors(&self) -> Result<Vec<anyhow::Error>> {
        let mut errors = Vec::new();
        loop {
            match self.error_receiver.try_recv() {
                Ok(error) => errors.push(error),
                Err(TryRecvError::Empty) => return Ok(errors),
                Err(TryRecvError::Disconnected) => bail!("local agent stopped"),
            }
        }
    }
}

fn collect_locally(
    store: SnapshotStore,
    command_receiver: Receiver<CollectionCommand>,
    error_sender: Sender<anyhow::Error>,
) {
    let mut interval = Duration::from_secs(DEFAULT_COLLECTION_INTERVAL_SECONDS);
    let mut enabled = false;
    loop {
        let command = if enabled {
            match command_receiver.recv_timeout(interval) {
                Ok(command) => Some(command),
                Err(RecvTimeoutError::Timeout) => {
                    let result =
                        crate::collector::collect().and_then(|snapshot| store.append(&snapshot));
                    if let Err(error) = result
                        && error_sender.send(error).is_err()
                    {
                        return;
                    }
                    None
                }
                Err(RecvTimeoutError::Disconnected) => return,
            }
        } else {
            match command_receiver.recv() {
                Ok(command) => Some(command),
                Err(_) => return,
            }
        };
        if let Some(command) = command {
            interval = command.interval;
            enabled = command.enabled;
            let _ = command.applied.send(());
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
