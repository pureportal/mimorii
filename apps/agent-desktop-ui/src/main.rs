#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
mod windows {
    use std::path::PathBuf;
    use std::process::{Command, Output};
    use std::sync::mpsc::{self, Receiver};
    use std::thread;
    use std::time::{Duration, Instant};

    use eframe::egui::{
        self, Align, Button, Color32, CornerRadius, Layout, RichText, Stroke, TextEdit, Theme,
        ThemePreference, Vec2, ViewportBuilder,
    };
    use serde::Deserialize;
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const REFRESH_INTERVAL: Duration = Duration::from_secs(10);

    #[derive(Clone, Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct AgentStatus {
        service: String,
        enrolled: bool,
        server_url: Option<String>,
        configuration_error: Option<String>,
    }

    enum AgentOperation {
        Refresh,
        Activate { server_url: String, key: String },
        Start,
        Stop,
        Diagnose,
    }

    struct OperationResult {
        status: Option<AgentStatus>,
        message: Option<String>,
        error: Option<String>,
        clear_key: bool,
    }

    struct AgentApp {
        executable: PathBuf,
        status: Option<AgentStatus>,
        server_url: String,
        key: String,
        result_message: Option<String>,
        result_error: Option<String>,
        operation: Option<Receiver<OperationResult>>,
        next_refresh: Instant,
    }

    impl AgentApp {
        fn new(context: &eframe::CreationContext<'_>) -> Self {
            configure_style(&context.egui_ctx);
            let executable = agent_executable().unwrap_or_default();
            let mut app = Self {
                executable,
                status: None,
                server_url: String::new(),
                key: String::new(),
                result_message: None,
                result_error: None,
                operation: None,
                next_refresh: Instant::now(),
            };
            app.begin(AgentOperation::Refresh, &context.egui_ctx);
            app
        }

        fn begin(&mut self, operation: AgentOperation, context: &egui::Context) {
            if self.operation.is_some() {
                return;
            }
            self.result_message = None;
            self.result_error = None;
            let executable = self.executable.clone();
            let repaint = context.clone();
            let (sender, receiver) = mpsc::channel();
            thread::spawn(move || {
                let result = perform_operation(&executable, operation);
                let _ = sender.send(result);
                repaint.request_repaint();
            });
            self.operation = Some(receiver);
        }

        fn receive_result(&mut self) {
            let Some(receiver) = self.operation.as_ref() else {
                return;
            };
            let Ok(result) = receiver.try_recv() else {
                return;
            };
            self.operation = None;
            if let Some(status) = result.status {
                if self.server_url.is_empty() {
                    self.server_url = status.server_url.clone().unwrap_or_default();
                }
                self.status = Some(status);
            }
            self.result_message = result.message;
            self.result_error = result.error;
            if result.clear_key {
                self.key.clear();
            }
            self.next_refresh = Instant::now() + REFRESH_INTERVAL;
        }

        fn status_header(&mut self, ui: &mut egui::Ui) {
            let (label, color) = match self.status.as_ref().map(|status| status.service.as_str()) {
                Some("running") => ("Running", Color32::from_rgb(31, 145, 104)),
                Some("stopped") => ("Stopped", Color32::from_rgb(196, 74, 74)),
                Some("starting" | "stopping") => ("Changing", Color32::from_rgb(201, 137, 42)),
                Some(_) => ("Unavailable", Color32::from_rgb(196, 74, 74)),
                None => ("Checking", Color32::from_rgb(112, 105, 134)),
            };
            ui.horizontal(|ui| {
                let (rect, _) = ui.allocate_exact_size(Vec2::splat(10.0), egui::Sense::hover());
                ui.painter().circle_filled(rect.center(), 5.0, color);
                ui.label(RichText::new(label).strong().size(16.0));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if ui
                        .add_enabled(self.operation.is_none(), Button::new("Refresh").small())
                        .clicked()
                    {
                        self.begin(AgentOperation::Refresh, ui.ctx());
                    }
                });
            });
            if let Some(server) = self
                .status
                .as_ref()
                .and_then(|status| status.server_url.as_ref())
            {
                ui.label(RichText::new(server).color(Color32::from_rgb(103, 96, 124)));
            } else if self.status.as_ref().is_some_and(|status| !status.enrolled) {
                ui.label(RichText::new("Not enrolled").color(Color32::from_rgb(103, 96, 124)));
            }
        }

        fn enrollment(&mut self, ui: &mut egui::Ui) {
            ui.label(RichText::new("Server URL").strong());
            ui.add(
                TextEdit::singleline(&mut self.server_url)
                    .hint_text("https://mimorii.example.com")
                    .desired_width(f32::INFINITY),
            );
            ui.add_space(6.0);
            ui.label(RichText::new("Enrollment key").strong());
            ui.add(
                TextEdit::singleline(&mut self.key)
                    .password(true)
                    .hint_text("mim_agent_...")
                    .desired_width(f32::INFINITY),
            );
            ui.add_space(10.0);
            let enrolled = self.status.as_ref().is_some_and(|status| status.enrolled);
            let activate = ui.add_enabled(
                self.operation.is_none()
                    && !self.server_url.trim().is_empty()
                    && !self.key.trim().is_empty(),
                Button::new(if enrolled {
                    "Update enrollment"
                } else {
                    "Activate"
                })
                .min_size(Vec2::new(ui.available_width(), 42.0))
                .fill(Color32::from_rgb(103, 79, 181))
                .stroke(Stroke::NONE),
            );
            if activate.clicked() {
                let server_url = self.server_url.trim().to_owned();
                let key = self.key.trim().to_owned();
                self.begin(AgentOperation::Activate { server_url, key }, ui.ctx());
            }
        }

        fn controls(&mut self, ui: &mut egui::Ui) {
            let service = self.status.as_ref().map(|status| status.service.clone());
            ui.horizontal(|ui| {
                let width = (ui.available_width() - 8.0) / 2.0;
                let (label, operation, enabled) = match service.as_deref() {
                    Some("running") => ("Stop service", AgentOperation::Stop, true),
                    Some("stopped") => ("Start service", AgentOperation::Start, true),
                    _ => ("Service busy", AgentOperation::Refresh, false),
                };
                if ui
                    .add_enabled(
                        enabled && self.operation.is_none(),
                        Button::new(label).min_size(Vec2::new(width, 38.0)),
                    )
                    .clicked()
                {
                    self.begin(operation, ui.ctx());
                }
                let enrolled = self.status.as_ref().is_some_and(|status| status.enrolled);
                if ui
                    .add_enabled(
                        enrolled && self.operation.is_none(),
                        Button::new("Run diagnostics").min_size(Vec2::new(width, 38.0)),
                    )
                    .clicked()
                {
                    self.begin(AgentOperation::Diagnose, ui.ctx());
                }
            });
        }
    }

    impl eframe::App for AgentApp {
        fn logic(&mut self, context: &egui::Context, _frame: &mut eframe::Frame) {
            self.receive_result();
            if self.operation.is_none() && Instant::now() >= self.next_refresh {
                self.begin(AgentOperation::Refresh, context);
            }
        }

        fn ui(&mut self, root: &mut egui::Ui, _frame: &mut eframe::Frame) {
            egui::CentralPanel::default()
                .frame(
                    egui::Frame::new()
                        .fill(Color32::from_rgb(248, 247, 252))
                        .inner_margin(egui::Margin::same(24)),
                )
                .show(root, |ui| {
                    ui.heading(RichText::new("Mimorii Agent").size(25.0).strong());
                    ui.add_space(18.0);
                    egui::Frame::new()
                        .fill(Color32::WHITE)
                        .stroke(Stroke::new(1.0, Color32::from_rgb(225, 221, 235)))
                        .corner_radius(CornerRadius::same(14))
                        .inner_margin(egui::Margin::same(16))
                        .show(ui, |ui| self.status_header(ui));

                    if self
                        .status
                        .as_ref()
                        .and_then(|status| status.configuration_error.as_ref())
                        .is_some()
                    {
                        ui.add_space(8.0);
                        ui.colored_label(
                            Color32::from_rgb(181, 53, 53),
                            "Configuration is invalid. Enter enrollment details to replace it.",
                        );
                    }

                    ui.add_space(18.0);
                    self.enrollment(ui);
                    ui.add_space(16.0);
                    ui.separator();
                    ui.add_space(12.0);
                    self.controls(ui);

                    if self.operation.is_some() {
                        ui.add_space(14.0);
                        ui.horizontal(|ui| {
                            ui.spinner();
                            ui.label("Working...");
                        });
                    } else if let Some(message) = self.result_message.as_ref() {
                        ui.add_space(14.0);
                        ui.colored_label(Color32::from_rgb(31, 122, 88), message);
                    } else if let Some(error) = self.result_error.as_ref() {
                        ui.add_space(14.0);
                        ui.colored_label(Color32::from_rgb(181, 53, 53), error);
                    }
                });
        }
    }

    fn configure_style(context: &egui::Context) {
        context.set_theme(ThemePreference::Light);
        let mut style = (*context.style_of(Theme::Light)).clone();
        style.spacing.item_spacing = Vec2::new(8.0, 8.0);
        style.spacing.button_padding = Vec2::new(12.0, 8.0);
        style.visuals = egui::Visuals::light();
        style.visuals.widgets.inactive.corner_radius = CornerRadius::same(8);
        style.visuals.widgets.hovered.corner_radius = CornerRadius::same(8);
        style.visuals.widgets.active.corner_radius = CornerRadius::same(8);
        context.set_style_of(Theme::Light, style);
    }

    fn perform_operation(executable: &PathBuf, operation: AgentOperation) -> OperationResult {
        let clear_key = matches!(&operation, AgentOperation::Activate { .. });
        let outcome = match operation {
            AgentOperation::Refresh => read_status(executable).map(|status| (status, None)),
            AgentOperation::Activate { server_url, key } => {
                run_agent(executable, ["enroll", "--server", &server_url], Some(&key))
                    .and_then(|_| {
                        let status = read_status(executable)?;
                        if status.service == "stopped" {
                            run_agent(executable, ["windows-service-control", "start"], None)?;
                        }
                        read_status(executable)
                    })
                    .map(|status| (status, Some("Agent activated".to_owned())))
            }
            AgentOperation::Start => {
                run_agent(executable, ["windows-service-control", "start"], None)
                    .and_then(|_| read_status(executable))
                    .map(|status| (status, Some("Service started".to_owned())))
            }
            AgentOperation::Stop => {
                run_agent(executable, ["windows-service-control", "stop"], None)
                    .and_then(|_| read_status(executable))
                    .map(|status| (status, Some("Service stopped".to_owned())))
            }
            AgentOperation::Diagnose => run_agent(executable, ["doctor"], None)
                .and_then(|_| read_status(executable))
                .map(|status| (status, Some("Connection verified".to_owned()))),
        };
        match outcome {
            Ok((status, message)) => OperationResult {
                status: Some(status),
                message,
                error: None,
                clear_key,
            },
            Err(error) => OperationResult {
                status: read_status(executable).ok(),
                message: None,
                error: Some(error),
                clear_key: false,
            },
        }
    }

    fn agent_executable() -> Result<PathBuf, String> {
        let current = std::env::current_exe()
            .map_err(|error| format!("Agent application path is unavailable: {error}"))?;
        let directory = current
            .parent()
            .ok_or_else(|| "Agent application directory is unavailable".to_owned())?;
        let executable = directory.join("mimorii-agent-desktop.exe");
        if !executable.is_file() {
            return Err(format!("Agent CLI is missing at {}", executable.display()));
        }
        Ok(executable)
    }

    fn read_status(executable: &PathBuf) -> Result<AgentStatus, String> {
        let output = run_agent(executable, ["status", "--json"], None)?;
        serde_json::from_str(output.trim()).map_err(|_| "Agent returned invalid status".to_owned())
    }

    fn run_agent<const N: usize>(
        executable: &PathBuf,
        arguments: [&str; N],
        key: Option<&str>,
    ) -> Result<String, String> {
        if !executable.is_file() {
            return Err(format!("Agent CLI is missing at {}", executable.display()));
        }
        let mut command = Command::new(executable);
        command
            .args(arguments)
            .creation_flags(CREATE_NO_WINDOW)
            .env_remove("MIMORII_AGENT_KEY");
        if let Some(key) = key {
            command.env("MIMORII_AGENT_KEY", key);
        }
        command
            .output()
            .map_err(|error| format!("Agent command could not start: {error}"))
            .and_then(output_text)
    }

    fn output_text(output: Output) -> Result<String, String> {
        if output.status.success() {
            return String::from_utf8(output.stdout)
                .map_err(|_| "Agent returned unreadable output".to_owned());
        }
        let error = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        if error.is_empty() {
            Err(format!("Agent command failed with {}", output.status))
        } else {
            Err(error)
        }
    }

    pub fn run() -> eframe::Result {
        let viewport = ViewportBuilder::default()
            .with_inner_size([430.0, 510.0])
            .with_min_inner_size([390.0, 470.0])
            .with_resizable(true);
        eframe::run_native(
            "Mimorii Agent",
            eframe::NativeOptions {
                viewport,
                ..Default::default()
            },
            Box::new(|context| Ok(Box::new(AgentApp::new(context)))),
        )
    }
}

#[cfg(windows)]
fn main() -> eframe::Result {
    windows::run()
}

#[cfg(not(windows))]
fn main() {
    eprintln!("Mimorii Agent desktop controls are available on Windows");
}
