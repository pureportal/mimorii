use std::ffi::OsStr;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Output};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use eframe::egui;

use crate::model::{AgentStatus, DoctorReport, UpdateStatus};
use crate::policy_form::PolicyInput;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const LOG_LINES: usize = 400;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Task {
    Refresh,
    CheckForUpdate,
    Enroll,
    SaveNetworkAccess,
    StartService,
    StopService,
    RunDiagnostics,
    LoadLogs,
    InstallUpdate,
}

impl Task {
    pub fn pending_label(self) -> &'static str {
        match self {
            Self::Refresh => "Refreshing…",
            Self::CheckForUpdate => "Checking for updates…",
            Self::Enroll => "Activating agent…",
            Self::SaveNetworkAccess => "Saving network access…",
            Self::StartService => "Starting service…",
            Self::StopService => "Stopping service…",
            Self::RunDiagnostics => "Running diagnostics…",
            Self::LoadLogs => "Loading log…",
            Self::InstallUpdate => "Starting installer…",
        }
    }

    pub fn is_background(self) -> bool {
        matches!(self, Self::Refresh | Self::LoadLogs | Self::CheckForUpdate)
    }
}

pub enum Request {
    Refresh,
    CheckForUpdate,
    Enroll { server_url: String, key: String },
    SaveNetworkAccess(PolicyInput),
    StartService,
    StopService,
    RunDiagnostics,
    LoadLogs,
    InstallUpdate,
}

impl Request {
    pub fn task(&self) -> Task {
        match self {
            Self::Refresh => Task::Refresh,
            Self::CheckForUpdate => Task::CheckForUpdate,
            Self::Enroll { .. } => Task::Enroll,
            Self::SaveNetworkAccess(_) => Task::SaveNetworkAccess,
            Self::StartService => Task::StartService,
            Self::StopService => Task::StopService,
            Self::RunDiagnostics => Task::RunDiagnostics,
            Self::LoadLogs => Task::LoadLogs,
            Self::InstallUpdate => Task::InstallUpdate,
        }
    }
}

pub enum Event {
    Status(Result<Box<AgentStatus>, String>),
    Update(UpdateStatus),
    Diagnostics(DoctorReport),
    Logs(String),
    Succeeded(Task, &'static str),
    Failed(Task, String),
    Finished(Task),
}

pub struct Worker {
    requests: Sender<Request>,
    events: Receiver<Event>,
}

impl Worker {
    pub fn start(context: egui::Context) -> Self {
        let (requests, request_receiver) = mpsc::channel::<Request>();
        let (event_sender, events) = mpsc::channel();
        thread::spawn(move || {
            let cli = AgentCli::locate();
            for request in request_receiver {
                let task = request.task();
                for event in perform(&cli, request) {
                    if event_sender.send(event).is_err() {
                        return;
                    }
                }
                if event_sender.send(Event::Finished(task)).is_err() {
                    return;
                }
                context.request_repaint();
            }
        });
        Self { requests, events }
    }

    pub fn send(&self, request: Request) -> bool {
        self.requests.send(request).is_ok()
    }

    pub fn events(&self) -> Vec<Event> {
        self.events.try_iter().collect()
    }
}

fn perform(cli: &Result<AgentCli, String>, request: Request) -> Vec<Event> {
    let task = request.task();
    let cli = match cli {
        Ok(cli) => cli,
        Err(error) => return vec![Event::Failed(task, error.clone())],
    };
    let status = |events: &mut Vec<Event>| events.push(Event::Status(cli.status().map(Box::new)));
    let mut events = Vec::new();
    let outcome = match request {
        Request::Refresh => {
            status(&mut events);
            Ok(None)
        }
        Request::CheckForUpdate => cli.update_status().map(|update| {
            events.push(Event::Update(update));
            None
        }),
        Request::Enroll { server_url, key } => cli.enroll(&server_url, &key).and_then(|()| {
            let current = cli.status()?;
            if current.service.can_start() {
                cli.run(["windows-service-control", "start"], None)?;
            }
            status(&mut events);
            Ok(Some("Agent activated"))
        }),
        Request::SaveNetworkAccess(input) => cli.configure(&input).map(|()| {
            status(&mut events);
            Some("Network access saved")
        }),
        Request::StartService => cli
            .run(["windows-service-control", "start"], None)
            .map(|_| {
                status(&mut events);
                Some("Service started")
            }),
        Request::StopService => cli.run(["windows-service-control", "stop"], None).map(|_| {
            status(&mut events);
            Some("Service stopped")
        }),
        Request::RunDiagnostics => cli.diagnose().map(|report| {
            events.push(Event::Diagnostics(report));
            status(&mut events);
            None
        }),
        Request::LoadLogs => cli.logs().map(|logs| {
            events.push(Event::Logs(logs));
            None
        }),
        Request::InstallUpdate => cli.run(["update"], None).map(|_| Some("Installer started")),
    };
    match outcome {
        Ok(Some(message)) => events.push(Event::Succeeded(task, message)),
        Ok(None) => {}
        Err(error) => {
            events.push(Event::Failed(task, error));
            if !task.is_background() {
                status(&mut events);
            }
        }
    }
    events
}

struct AgentCli {
    executable: PathBuf,
}

impl AgentCli {
    fn locate() -> Result<Self, String> {
        let current = std::env::current_exe()
            .map_err(|error| format!("Agent application path is unavailable: {error}"))?;
        let executable = current
            .parent()
            .ok_or_else(|| "Agent application directory is unavailable".to_owned())?
            .join("mimorii-agent-desktop.exe");
        if !executable.is_file() {
            return Err(format!("Agent CLI is missing at {}", executable.display()));
        }
        Ok(Self { executable })
    }

    fn status(&self) -> Result<AgentStatus, String> {
        let output = self.run(["status", "--json"], None)?;
        serde_json::from_str(output.trim()).map_err(|_| "Agent returned invalid status".to_owned())
    }

    fn update_status(&self) -> Result<UpdateStatus, String> {
        let output = self.run(["update", "--check", "--json"], None)?;
        serde_json::from_str(output.trim())
            .map_err(|_| "Agent returned invalid update status".to_owned())
    }

    fn enroll(&self, server_url: &str, key: &str) -> Result<(), String> {
        self.run(["enroll", "--server", server_url], Some(key))
            .map(|_| ())
    }

    fn configure(&self, input: &PolicyInput) -> Result<(), String> {
        self.run(
            [
                "config",
                "--allowed-cidrs",
                &input.allowed_cidrs,
                "--allowed-hostnames",
                &input.allowed_hostnames,
                "--allowed-protocols",
                &input.allowed_protocols,
                "--allowed-ports",
                &input.allowed_ports,
            ],
            None,
        )
        .map(|_| ())
    }

    fn diagnose(&self) -> Result<DoctorReport, String> {
        let output = self.command(["doctor", "--json"], None)?;
        serde_json::from_slice(&output.stdout).map_err(|_| failure_text(&output))
    }

    fn logs(&self) -> Result<String, String> {
        self.run(["logs", "--lines", &LOG_LINES.to_string()], None)
    }

    fn run<I, S>(&self, arguments: I, key: Option<&str>) -> Result<String, String>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let output = self.command(arguments, key)?;
        if !output.status.success() {
            return Err(failure_text(&output));
        }
        String::from_utf8(output.stdout).map_err(|_| "Agent returned unreadable output".to_owned())
    }

    fn command<I, S>(&self, arguments: I, key: Option<&str>) -> Result<Output, String>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = Command::new(&self.executable);
        command
            .args(arguments)
            .creation_flags(CREATE_NO_WINDOW)
            .env_remove("MIMORII_AGENT_KEY")
            .env("NO_COLOR", "1");
        if let Some(key) = key {
            command.env("MIMORII_AGENT_KEY", key);
        }
        command
            .output()
            .map_err(|error| format!("Agent command could not start: {error}"))
    }
}

fn failure_text(output: &Output) -> String {
    let error = String::from_utf8_lossy(&output.stderr);
    if error.trim().is_empty() {
        format!("Agent command failed with {}", output.status)
    } else {
        concise_error(&error)
    }
}

fn concise_error(error: &str) -> String {
    let error = error.trim();
    let error = error.strip_prefix("Error: ").unwrap_or(error);
    let (headline, causes) = error
        .split_once("Caused by:")
        .map_or((error, None), |(headline, causes)| (headline, Some(causes)));
    let headline = headline.trim();
    let root_cause = causes.and_then(|causes| {
        causes
            .lines()
            .map(str::trim)
            .rfind(|line| !line.is_empty())
            .map(|line| {
                line.split_once(": ")
                    .filter(|(index, _)| index.chars().all(|character| character.is_ascii_digit()))
                    .map_or(line, |(_, cause)| cause)
            })
    });
    match root_cause {
        Some(cause) if cause != headline => format!("{headline}: {cause}"),
        _ => headline.to_owned(),
    }
}

#[cfg(test)]
#[path = "agent_tests.rs"]
mod tests;
