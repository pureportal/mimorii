#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
mod windows {
    use std::path::PathBuf;
    use std::process::{Command, Output};
    use std::sync::mpsc::{self, Receiver};
    use std::thread;
    use std::time::{Duration, Instant};

    use eframe::egui::{
        self, Align, Button, Color32, CornerRadius, FontId, Layout, RichText, Stroke, TextEdit,
        TextStyle, Theme, ThemePreference, Vec2, ViewportBuilder,
    };
    use serde::Deserialize;
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const REFRESH_INTERVAL: Duration = Duration::from_secs(10);
    const UPDATE_CHECK_INTERVAL: Duration = Duration::from_secs(30 * 60);
    const DEFAULT_SERVER_URL: &str = "https://mimorii.app/api";

    #[derive(Clone, Copy)]
    struct ThemePalette {
        background: Color32,
        surface: Color32,
        surface_muted: Color32,
        input_background: Color32,
        text: Color32,
        muted: Color32,
        line: Color32,
        primary: Color32,
        primary_hover: Color32,
        primary_foreground: Color32,
        success: Color32,
        success_background: Color32,
        success_line: Color32,
        warning: Color32,
        danger: Color32,
        danger_background: Color32,
        danger_line: Color32,
    }

    impl ThemePalette {
        const LIGHT: Self = Self {
            background: Color32::from_rgb(247, 246, 250),
            surface: Color32::WHITE,
            surface_muted: Color32::from_rgb(246, 244, 249),
            input_background: Color32::from_rgb(251, 250, 252),
            text: Color32::from_rgb(37, 32, 47),
            muted: Color32::from_rgb(105, 98, 119),
            line: Color32::from_rgb(224, 220, 230),
            primary: Color32::from_rgb(103, 79, 181),
            primary_hover: Color32::from_rgb(91, 67, 166),
            primary_foreground: Color32::WHITE,
            success: Color32::from_rgb(28, 126, 89),
            success_background: Color32::from_rgb(237, 248, 243),
            success_line: Color32::from_rgb(194, 229, 214),
            warning: Color32::from_rgb(181, 113, 27),
            danger: Color32::from_rgb(181, 53, 53),
            danger_background: Color32::from_rgb(253, 241, 241),
            danger_line: Color32::from_rgb(239, 204, 204),
        };

        const DARK: Self = Self {
            background: Color32::from_rgb(20, 18, 24),
            surface: Color32::from_rgb(30, 26, 37),
            surface_muted: Color32::from_rgb(40, 34, 47),
            input_background: Color32::from_rgb(24, 21, 29),
            text: Color32::from_rgb(242, 239, 247),
            muted: Color32::from_rgb(182, 174, 194),
            line: Color32::from_rgb(64, 57, 73),
            primary: Color32::from_rgb(114, 82, 199),
            primary_hover: Color32::from_rgb(100, 69, 179),
            primary_foreground: Color32::WHITE,
            success: Color32::from_rgb(105, 214, 166),
            success_background: Color32::from_rgb(22, 52, 42),
            success_line: Color32::from_rgb(43, 90, 73),
            warning: Color32::from_rgb(244, 183, 102),
            danger: Color32::from_rgb(255, 146, 146),
            danger_background: Color32::from_rgb(58, 32, 37),
            danger_line: Color32::from_rgb(107, 52, 62),
        };

        fn for_theme(theme: Theme) -> Self {
            match theme {
                Theme::Dark => Self::DARK,
                Theme::Light => Self::LIGHT,
            }
        }

        fn for_ui(ui: &egui::Ui) -> Self {
            Self::for_theme(Theme::from_dark_mode(ui.visuals().dark_mode))
        }
    }

    #[derive(Clone, Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct AgentStatus {
        service: String,
        enrolled: bool,
        server_url: Option<String>,
        target_policy: Option<TargetPolicy>,
        configuration_error: Option<String>,
    }

    #[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq)]
    #[serde(rename_all = "camelCase")]
    struct TargetPolicy {
        allowed_cidrs: Vec<String>,
        allowed_hostnames: Vec<String>,
        allowed_protocols: Vec<String>,
        allowed_ports: Vec<u16>,
    }

    #[derive(Clone, Debug, Default, Eq, PartialEq)]
    struct TargetPolicyForm {
        limit_ip_addresses: bool,
        allowed_cidrs: String,
        limit_hostnames: bool,
        allowed_hostnames: String,
        limit_protocols: bool,
        http: bool,
        https: bool,
        tcp: bool,
        icmp: bool,
        limit_ports: bool,
        allowed_ports: String,
    }

    impl TargetPolicyForm {
        fn from_policy(policy: &TargetPolicy) -> Self {
            let restricted_protocols = !policy.allowed_protocols.is_empty();
            Self {
                limit_ip_addresses: !policy.allowed_cidrs.is_empty(),
                allowed_cidrs: join_values(&policy.allowed_cidrs),
                limit_hostnames: !policy.allowed_hostnames.is_empty(),
                allowed_hostnames: join_values(&policy.allowed_hostnames),
                limit_protocols: restricted_protocols,
                http: !restricted_protocols
                    || policy.allowed_protocols.iter().any(|value| value == "http"),
                https: !restricted_protocols
                    || policy
                        .allowed_protocols
                        .iter()
                        .any(|value| value == "https"),
                tcp: !restricted_protocols
                    || policy.allowed_protocols.iter().any(|value| value == "tcp"),
                icmp: !restricted_protocols
                    || policy.allowed_protocols.iter().any(|value| value == "icmp"),
                limit_ports: !policy.allowed_ports.is_empty(),
                allowed_ports: join_values(&policy.allowed_ports),
            }
        }

        fn is_valid(&self) -> bool {
            (!self.limit_ip_addresses || !self.allowed_cidrs.trim().is_empty())
                && (!self.limit_hostnames || !self.allowed_hostnames.trim().is_empty())
                && (!self.limit_protocols || self.http || self.https || self.tcp || self.icmp)
                && (!self.limit_ports || !self.allowed_ports.trim().is_empty())
        }

        fn input(&self) -> TargetPolicyInput {
            let allowed_protocols = if self.limit_protocols {
                [
                    (self.http, "http"),
                    (self.https, "https"),
                    (self.tcp, "tcp"),
                    (self.icmp, "icmp"),
                ]
                .into_iter()
                .filter_map(|(selected, protocol)| selected.then_some(protocol))
                .collect::<Vec<_>>()
                .join(",")
            } else {
                String::new()
            };
            TargetPolicyInput {
                allowed_cidrs: if self.limit_ip_addresses {
                    self.allowed_cidrs.trim().to_owned()
                } else {
                    String::new()
                },
                allowed_hostnames: if self.limit_hostnames {
                    self.allowed_hostnames.trim().to_owned()
                } else {
                    String::new()
                },
                allowed_protocols,
                allowed_ports: if self.limit_ports {
                    self.allowed_ports.trim().to_owned()
                } else {
                    String::new()
                },
            }
        }
    }

    struct TargetPolicyInput {
        allowed_cidrs: String,
        allowed_hostnames: String,
        allowed_protocols: String,
        allowed_ports: String,
    }

    #[derive(Clone, Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct UpdateStatus {
        latest_version: String,
        update_available: bool,
    }

    enum AgentOperation {
        Refresh { check_for_update: bool },
        Activate { server_url: String, key: String },
        Configure { input: TargetPolicyInput },
        Start,
        Stop,
        Diagnose,
        Update,
    }

    impl AgentOperation {
        fn pending_label(&self) -> &'static str {
            match self {
                Self::Refresh { .. } => "Refreshing status…",
                Self::Activate { .. } => "Activating agent…",
                Self::Configure { .. } => "Saving network access…",
                Self::Start => "Starting service…",
                Self::Stop => "Stopping service…",
                Self::Diagnose => "Running diagnostics…",
                Self::Update => "Starting installer…",
            }
        }
    }

    struct OperationResult {
        status: Option<AgentStatus>,
        message: Option<String>,
        error: Option<String>,
        clear_key: bool,
        update: Option<UpdateStatus>,
        update_checked: bool,
        policy_saved: bool,
    }

    struct AgentApp {
        executable: PathBuf,
        status: Option<AgentStatus>,
        update: Option<UpdateStatus>,
        server_url: String,
        key: String,
        target_policy: TargetPolicyForm,
        policy_dirty: bool,
        result_message: Option<String>,
        result_error: Option<String>,
        operation: Option<Receiver<OperationResult>>,
        operation_label: Option<&'static str>,
        received_initial_status: bool,
        next_refresh: Instant,
        next_update_check: Instant,
    }

    impl AgentApp {
        fn new(context: &eframe::CreationContext<'_>) -> Self {
            configure_style(&context.egui_ctx);
            let executable = agent_executable().unwrap_or_default();
            let mut app = Self {
                executable,
                status: None,
                update: None,
                server_url: DEFAULT_SERVER_URL.to_owned(),
                key: String::new(),
                target_policy: TargetPolicyForm::default(),
                policy_dirty: false,
                result_message: None,
                result_error: None,
                operation: None,
                operation_label: None,
                received_initial_status: false,
                next_refresh: Instant::now(),
                next_update_check: Instant::now(),
            };
            app.begin(
                AgentOperation::Refresh {
                    check_for_update: true,
                },
                &context.egui_ctx,
            );
            app
        }

        fn begin(&mut self, operation: AgentOperation, context: &egui::Context) {
            if self.operation.is_some() {
                return;
            }
            self.result_message = None;
            self.result_error = None;
            self.operation_label = Some(operation.pending_label());
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
            self.operation_label = None;
            if let Some(status) = result.status {
                if !self.received_initial_status {
                    if let Some(server_url) = status.server_url.as_ref() {
                        self.server_url.clone_from(server_url);
                    }
                    self.received_initial_status = true;
                }
                if (!self.policy_dirty || result.policy_saved)
                    && let Some(policy) = status.target_policy.as_ref()
                {
                    self.target_policy = TargetPolicyForm::from_policy(policy);
                    self.policy_dirty = false;
                }
                self.status = Some(status);
            }
            self.result_message = result.message;
            self.result_error = result.error;
            if result.clear_key {
                self.key.clear();
            }
            if result.update_checked {
                self.update = result.update;
                self.next_update_check = Instant::now() + UPDATE_CHECK_INTERVAL;
            }
            self.next_refresh = Instant::now() + REFRESH_INTERVAL;
        }

        fn status_header(&mut self, ui: &mut egui::Ui) {
            let palette = ThemePalette::for_ui(ui);
            let (label, color) = match self.status.as_ref().map(|status| status.service.as_str()) {
                Some("running") => ("Running", palette.success),
                Some("stopped") => ("Stopped", palette.danger),
                Some("starting") => ("Starting", palette.warning),
                Some("stopping") => ("Stopping", palette.warning),
                Some(_) => ("Unavailable", palette.danger),
                None => ("Checking", palette.muted),
            };
            ui.horizontal(|ui| {
                let (rect, _) = ui.allocate_exact_size(Vec2::splat(10.0), egui::Sense::hover());
                ui.painter().circle_filled(rect.center(), 5.0, color);
                ui.label(RichText::new(label).strong().size(16.0).color(palette.text));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if ui
                        .add_enabled(
                            self.operation.is_none(),
                            Button::new(RichText::new("Refresh").size(13.0).color(palette.muted))
                                .min_size(Vec2::new(76.0, 32.0))
                                .fill(palette.surface_muted)
                                .stroke(Stroke::NONE),
                        )
                        .clicked()
                    {
                        self.begin(
                            AgentOperation::Refresh {
                                check_for_update: true,
                            },
                            ui.ctx(),
                        );
                    }
                });
            });
            if let Some(server) = self
                .status
                .as_ref()
                .and_then(|status| status.server_url.as_ref())
            {
                ui.add_space(4.0);
                ui.label(RichText::new(server).color(palette.muted).size(13.0));
            } else if self.status.as_ref().is_some_and(|status| !status.enrolled) {
                ui.add_space(4.0);
                ui.label(
                    RichText::new("Not enrolled")
                        .color(palette.muted)
                        .size(13.0),
                );
            }
        }

        fn enrollment(&mut self, ui: &mut egui::Ui) {
            let palette = ThemePalette::for_ui(ui);
            ui.label(
                RichText::new("Enrollment")
                    .strong()
                    .size(16.0)
                    .color(palette.text),
            );
            ui.add_space(14.0);
            ui.label(
                RichText::new("Server URL")
                    .strong()
                    .size(13.0)
                    .color(palette.text),
            );
            ui.add_space(4.0);
            ui.add(
                TextEdit::singleline(&mut self.server_url)
                    .margin(egui::Margin::symmetric(12, 9))
                    .background_color(palette.input_background)
                    .desired_width(f32::INFINITY),
            );
            ui.add_space(10.0);
            ui.label(
                RichText::new("Enrollment key")
                    .strong()
                    .size(13.0)
                    .color(palette.text),
            );
            ui.add_space(4.0);
            ui.add(
                TextEdit::singleline(&mut self.key)
                    .password(true)
                    .hint_text("mim_agent_...")
                    .margin(egui::Margin::symmetric(12, 9))
                    .background_color(palette.input_background)
                    .desired_width(f32::INFINITY),
            );
            ui.add_space(14.0);
            let enrolled = self.status.as_ref().is_some_and(|status| status.enrolled);
            let label = if enrolled {
                "Update enrollment"
            } else {
                "Activate agent"
            };
            let enabled = self.operation.is_none()
                && !self.server_url.trim().is_empty()
                && !self.key.trim().is_empty();
            let activate = ui.add_enabled(
                enabled,
                primary_button(label, enabled, palette)
                    .min_size(Vec2::new(ui.available_width(), 44.0)),
            );
            if activate.clicked() {
                let server_url = self.server_url.trim().to_owned();
                let key = self.key.trim().to_owned();
                self.begin(AgentOperation::Activate { server_url, key }, ui.ctx());
            }
        }

        fn controls(&mut self, ui: &mut egui::Ui) {
            let service = self.status.as_ref().map(|status| status.service.clone());
            ui.spacing_mut().item_spacing.x = 10.0;
            ui.horizontal(|ui| {
                let width = (ui.available_width() - 10.0) / 2.0;
                let (label, operation, enabled) = match service.as_deref() {
                    Some("running") => ("Stop service", AgentOperation::Stop, true),
                    Some("stopped") => ("Start service", AgentOperation::Start, true),
                    Some("starting") => (
                        "Starting service…",
                        AgentOperation::Refresh {
                            check_for_update: false,
                        },
                        false,
                    ),
                    Some("stopping") => (
                        "Stopping service…",
                        AgentOperation::Refresh {
                            check_for_update: false,
                        },
                        false,
                    ),
                    Some(_) => (
                        "Service unavailable",
                        AgentOperation::Refresh {
                            check_for_update: false,
                        },
                        false,
                    ),
                    None => (
                        "Checking service…",
                        AgentOperation::Refresh {
                            check_for_update: false,
                        },
                        false,
                    ),
                };
                if ui
                    .add_enabled(
                        enabled && self.operation.is_none(),
                        Button::new(label).min_size(Vec2::new(width, 42.0)),
                    )
                    .clicked()
                {
                    self.begin(operation, ui.ctx());
                }
                let enrolled = self.status.as_ref().is_some_and(|status| status.enrolled);
                if ui
                    .add_enabled(
                        enrolled && self.operation.is_none(),
                        Button::new("Run diagnostics").min_size(Vec2::new(width, 42.0)),
                    )
                    .clicked()
                {
                    self.begin(AgentOperation::Diagnose, ui.ctx());
                }
            });
        }

        fn network_access(&mut self, ui: &mut egui::Ui) {
            let palette = ThemePalette::for_ui(ui);
            ui.label(
                RichText::new("Network access")
                    .strong()
                    .size(16.0)
                    .color(palette.text),
            );
            ui.add_space(12.0);
            let previous = self.target_policy.clone();
            ui.checkbox(
                &mut self.target_policy.limit_ip_addresses,
                "Limit IP addresses",
            );
            if self.target_policy.limit_ip_addresses {
                policy_text_field(
                    ui,
                    "Allowed CIDRs",
                    "192.168.1.0/24, 10.0.0.12/32",
                    &mut self.target_policy.allowed_cidrs,
                    palette,
                );
            }
            ui.add_space(6.0);
            ui.checkbox(&mut self.target_policy.limit_hostnames, "Limit hostnames");
            if self.target_policy.limit_hostnames {
                policy_text_field(
                    ui,
                    "Allowed hostnames",
                    "*.internal.example, status.example.com",
                    &mut self.target_policy.allowed_hostnames,
                    palette,
                );
            }
            ui.add_space(6.0);
            ui.checkbox(&mut self.target_policy.limit_protocols, "Limit protocols");
            if self.target_policy.limit_protocols {
                ui.indent("allowed-protocols", |ui| {
                    ui.horizontal_wrapped(|ui| {
                        ui.checkbox(&mut self.target_policy.http, "HTTP");
                        ui.checkbox(&mut self.target_policy.https, "HTTPS");
                        ui.checkbox(&mut self.target_policy.tcp, "TCP");
                        ui.checkbox(&mut self.target_policy.icmp, "ICMP");
                    });
                });
            }
            ui.add_space(6.0);
            ui.checkbox(&mut self.target_policy.limit_ports, "Limit ports");
            if self.target_policy.limit_ports {
                policy_text_field(
                    ui,
                    "Allowed ports",
                    "80, 443, 5432",
                    &mut self.target_policy.allowed_ports,
                    palette,
                );
            }
            if self.target_policy != previous {
                self.policy_dirty = true;
            }
            ui.add_space(14.0);
            let enabled =
                self.operation.is_none() && self.policy_dirty && self.target_policy.is_valid();
            if ui
                .add_enabled(
                    enabled,
                    primary_button("Save network access", enabled, palette)
                        .min_size(Vec2::new(ui.available_width(), 42.0)),
                )
                .clicked()
            {
                self.begin(
                    AgentOperation::Configure {
                        input: self.target_policy.input(),
                    },
                    ui.ctx(),
                );
            }
        }

        fn software_update(&mut self, ui: &mut egui::Ui) {
            let palette = ThemePalette::for_ui(ui);
            let Some(update) = self
                .update
                .as_ref()
                .filter(|update| update.update_available)
            else {
                return;
            };
            let version = update.latest_version.clone();
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(format!("Version {version} available"))
                        .strong()
                        .color(palette.text),
                );
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let enabled = self.operation.is_none();
                    if ui
                        .add_enabled(enabled, primary_button("Install update", enabled, palette))
                        .clicked()
                    {
                        self.begin(AgentOperation::Update, ui.ctx());
                    }
                });
            });
        }

        fn feedback(&self, ui: &mut egui::Ui) {
            let palette = ThemePalette::for_ui(ui);
            if self.operation.is_some() {
                feedback_frame(palette.surface_muted, palette.line).show(ui, |ui| {
                    ui.set_min_width(ui.available_width());
                    ui.horizontal(|ui| {
                        ui.add(egui::Spinner::new().color(palette.muted));
                        ui.label(
                            RichText::new(self.operation_label.unwrap_or("Working…"))
                                .color(palette.muted),
                        );
                    });
                });
            } else if let Some(message) = self.result_message.as_ref() {
                feedback_frame(palette.success_background, palette.success_line).show(ui, |ui| {
                    ui.set_min_width(ui.available_width());
                    ui.colored_label(palette.success, message);
                });
            } else if let Some(error) = self.result_error.as_ref() {
                feedback_frame(palette.danger_background, palette.danger_line).show(ui, |ui| {
                    ui.set_min_width(ui.available_width());
                    ui.colored_label(palette.danger, error);
                });
            }
        }
    }

    impl eframe::App for AgentApp {
        fn logic(&mut self, context: &egui::Context, _frame: &mut eframe::Frame) {
            self.receive_result();
            if self.operation.is_none() && Instant::now() >= self.next_refresh {
                self.begin(
                    AgentOperation::Refresh {
                        check_for_update: Instant::now() >= self.next_update_check,
                    },
                    context,
                );
            }
        }

        fn ui(&mut self, root: &mut egui::Ui, _frame: &mut eframe::Frame) {
            let palette = ThemePalette::for_ui(root);
            egui::CentralPanel::default()
                .frame(
                    egui::Frame::new()
                        .fill(palette.background)
                        .inner_margin(egui::Margin::symmetric(28, 26)),
                )
                .show(root, |ui| {
                    egui::ScrollArea::vertical()
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            ui.set_min_width(ui.available_width());
                            ui.heading(
                                RichText::new("Mimorii Agent")
                                    .size(26.0)
                                    .strong()
                                    .color(palette.text),
                            );
                            ui.add_space(18.0);
                            panel_frame(palette).show(ui, |ui| {
                                ui.set_min_width(ui.available_width());
                                self.status_header(ui);
                            });

                            if self
                                .update
                                .as_ref()
                                .is_some_and(|update| update.update_available)
                            {
                                ui.add_space(10.0);
                                panel_frame(palette).show(ui, |ui| {
                                    ui.set_min_width(ui.available_width());
                                    self.software_update(ui);
                                });
                            }

                            if self
                                .status
                                .as_ref()
                                .and_then(|status| status.configuration_error.as_ref())
                                .is_some()
                            {
                                ui.add_space(10.0);
                                feedback_frame(palette.danger_background, palette.danger_line).show(
                                    ui,
                                    |ui| {
                                        ui.set_min_width(ui.available_width());
                                        ui.colored_label(
                                            palette.danger,
                                            "Configuration is invalid. Enter enrollment details again.",
                                        );
                                    },
                                );
                            }

                            ui.add_space(14.0);
                            panel_frame(palette).show(ui, |ui| {
                                ui.set_min_width(ui.available_width());
                                self.enrollment(ui);
                            });
                            if self.status.as_ref().is_some_and(|status| status.enrolled) {
                                ui.add_space(14.0);
                                panel_frame(palette).show(ui, |ui| {
                                    ui.set_min_width(ui.available_width());
                                    self.network_access(ui);
                                });
                            }
                            ui.add_space(14.0);
                            panel_frame(palette).show(ui, |ui| {
                                ui.set_min_width(ui.available_width());
                                self.controls(ui);
                            });

                            if self.operation.is_some()
                                || self.result_message.is_some()
                                || self.result_error.is_some()
                            {
                                ui.add_space(12.0);
                                self.feedback(ui);
                            }
                        });
                });
        }
    }

    fn panel_frame(palette: ThemePalette) -> egui::Frame {
        egui::Frame::new()
            .fill(palette.surface)
            .stroke(Stroke::new(1.0, palette.line))
            .corner_radius(CornerRadius::same(14))
            .inner_margin(egui::Margin::same(17))
    }

    fn feedback_frame(fill: Color32, stroke: Color32) -> egui::Frame {
        egui::Frame::new()
            .fill(fill)
            .stroke(Stroke::new(1.0, stroke))
            .corner_radius(CornerRadius::same(10))
            .inner_margin(egui::Margin::symmetric(13, 11))
    }

    fn primary_button(
        label: &'static str,
        enabled: bool,
        palette: ThemePalette,
    ) -> Button<'static> {
        if enabled {
            Button::new(
                RichText::new(label)
                    .strong()
                    .color(palette.primary_foreground),
            )
            .fill(palette.primary)
            .stroke(Stroke::NONE)
        } else {
            Button::new(label)
                .fill(palette.surface_muted)
                .stroke(Stroke::new(1.0, palette.line))
        }
    }

    fn policy_text_field(
        ui: &mut egui::Ui,
        label: &str,
        hint: &str,
        value: &mut String,
        palette: ThemePalette,
    ) {
        ui.indent(label, |ui| {
            ui.label(RichText::new(label).strong().size(13.0).color(palette.text));
            ui.add(
                TextEdit::singleline(value)
                    .hint_text(hint)
                    .margin(egui::Margin::symmetric(12, 9))
                    .background_color(palette.input_background)
                    .desired_width(f32::INFINITY),
            );
        });
    }

    fn join_values<T: ToString>(values: &[T]) -> String {
        values
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(", ")
    }

    fn configure_style(context: &egui::Context) {
        context.set_style_of(Theme::Light, configured_style(Theme::Light));
        context.set_style_of(Theme::Dark, configured_style(Theme::Dark));
        context.set_theme(ThemePreference::System);
    }

    fn configured_style(theme: Theme) -> egui::Style {
        let palette = ThemePalette::for_theme(theme);
        let mut style = theme.default_style();
        style.text_styles = [
            (TextStyle::Heading, FontId::proportional(26.0)),
            (TextStyle::Body, FontId::proportional(14.0)),
            (TextStyle::Button, FontId::proportional(14.0)),
            (TextStyle::Small, FontId::proportional(12.0)),
            (TextStyle::Monospace, FontId::monospace(13.0)),
        ]
        .into();
        style.spacing.item_spacing = Vec2::new(8.0, 6.0);
        style.spacing.button_padding = Vec2::new(14.0, 9.0);
        style.spacing.interact_size.y = 40.0;
        style.visuals.override_text_color = None;
        style.visuals.disabled_alpha = 0.6;
        style.visuals.panel_fill = palette.background;
        style.visuals.window_fill = palette.background;
        style.visuals.extreme_bg_color = palette.input_background;
        style.visuals.text_edit_bg_color = Some(palette.input_background);
        style.visuals.faint_bg_color = palette.surface_muted;
        style.visuals.code_bg_color = palette.surface_muted;
        style.visuals.selection.bg_fill = palette.primary;
        style.visuals.selection.stroke = Stroke::new(1.0, palette.primary_foreground);
        style.visuals.error_fg_color = palette.danger;
        style.visuals.warn_fg_color = palette.warning;
        style.visuals.widgets.noninteractive.fg_stroke = Stroke::new(1.0, palette.text);
        style.visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0, palette.line);
        style.visuals.widgets.inactive.bg_fill = palette.surface;
        style.visuals.widgets.inactive.weak_bg_fill = palette.surface;
        style.visuals.widgets.inactive.bg_stroke = Stroke::new(1.0, palette.line);
        style.visuals.widgets.inactive.fg_stroke = Stroke::new(1.0, palette.text);
        style.visuals.widgets.inactive.corner_radius = CornerRadius::same(9);
        style.visuals.widgets.hovered.bg_fill = palette.surface_muted;
        style.visuals.widgets.hovered.weak_bg_fill = palette.surface_muted;
        style.visuals.widgets.hovered.bg_stroke = Stroke::new(1.0, palette.primary);
        style.visuals.widgets.hovered.fg_stroke = Stroke::new(1.0, palette.text);
        style.visuals.widgets.hovered.corner_radius = CornerRadius::same(9);
        style.visuals.widgets.active.bg_fill = palette.primary_hover;
        style.visuals.widgets.active.weak_bg_fill = palette.primary_hover;
        style.visuals.widgets.active.bg_stroke = Stroke::new(1.0, palette.primary_hover);
        style.visuals.widgets.active.fg_stroke = Stroke::new(1.0, palette.primary_foreground);
        style.visuals.widgets.active.corner_radius = CornerRadius::same(9);
        style
    }

    fn window_icon() -> egui::IconData {
        eframe::icon_data::from_png_bytes(include_bytes!("../../client/src-tauri/icons/icon.png"))
            .expect("Mimorii application icon is invalid")
    }

    fn perform_operation(executable: &PathBuf, operation: AgentOperation) -> OperationResult {
        let clear_key = matches!(&operation, AgentOperation::Activate { .. });
        let update_checked = matches!(
            &operation,
            AgentOperation::Refresh {
                check_for_update: true
            }
        );
        let configuring_policy = matches!(&operation, AgentOperation::Configure { .. });
        let outcome = match operation {
            AgentOperation::Refresh { check_for_update } => {
                read_status(executable).and_then(|status| {
                    let update = if check_for_update {
                        Some(read_update_status(executable)?)
                    } else {
                        None
                    };
                    Ok((status, None, update))
                })
            }
            AgentOperation::Activate { server_url, key } => {
                run_agent(executable, ["enroll", "--server", &server_url], Some(&key))
                    .and_then(|_| {
                        let status = read_status(executable)?;
                        if status.service == "stopped" {
                            run_agent(executable, ["windows-service-control", "start"], None)?;
                        }
                        read_status(executable)
                    })
                    .map(|status| (status, Some("Agent activated".to_owned()), None))
            }
            AgentOperation::Configure { input } => {
                let arguments = vec![
                    "config".to_owned(),
                    "--allowed-cidrs".to_owned(),
                    input.allowed_cidrs,
                    "--allowed-hostnames".to_owned(),
                    input.allowed_hostnames,
                    "--allowed-protocols".to_owned(),
                    input.allowed_protocols,
                    "--allowed-ports".to_owned(),
                    input.allowed_ports,
                ];
                run_agent(executable, arguments, None)
                    .and_then(|_| read_status(executable))
                    .map(|status| (status, Some("Network access saved".to_owned()), None))
            }
            AgentOperation::Start => {
                run_agent(executable, ["windows-service-control", "start"], None)
                    .and_then(|_| read_status(executable))
                    .map(|status| (status, Some("Service started".to_owned()), None))
            }
            AgentOperation::Stop => {
                run_agent(executable, ["windows-service-control", "stop"], None)
                    .and_then(|_| read_status(executable))
                    .map(|status| (status, Some("Service stopped".to_owned()), None))
            }
            AgentOperation::Diagnose => run_agent(executable, ["doctor"], None)
                .and_then(|_| read_status(executable))
                .map(|status| (status, Some("Connection verified".to_owned()), None)),
            AgentOperation::Update => read_status(executable).and_then(|status| {
                run_agent(executable, ["update"], None)?;
                Ok((status, Some("Installer started".to_owned()), None))
            }),
        };
        match outcome {
            Ok((status, message, update)) => OperationResult {
                status: Some(status),
                message,
                error: None,
                clear_key,
                update,
                update_checked,
                policy_saved: configuring_policy,
            },
            Err(error) => OperationResult {
                status: read_status(executable).ok(),
                message: None,
                error: Some(error),
                clear_key: false,
                update: None,
                update_checked,
                policy_saved: false,
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

    fn read_update_status(executable: &PathBuf) -> Result<UpdateStatus, String> {
        let output = run_agent(executable, ["update", "--check", "--json"], None)?;
        serde_json::from_str(output.trim())
            .map_err(|_| "Agent returned invalid update status".to_owned())
    }

    fn run_agent<I, S>(
        executable: &PathBuf,
        arguments: I,
        key: Option<&str>,
    ) -> Result<String, String>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<std::ffi::OsStr>,
    {
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
            .with_inner_size([470.0, 620.0])
            .with_min_inner_size([430.0, 590.0])
            .with_icon(window_icon())
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

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn server_url_uses_the_mimorii_api_by_default() {
            assert_eq!(DEFAULT_SERVER_URL, "https://mimorii.app/api");
        }

        #[test]
        fn unrestricted_policy_form_saves_empty_restrictions() {
            let form = TargetPolicyForm::from_policy(&TargetPolicy::default());
            assert!(!form.limit_ip_addresses);
            assert!(!form.limit_hostnames);
            assert!(!form.limit_protocols);
            assert!(!form.limit_ports);
            assert!(form.is_valid());

            let input = form.input();
            assert!(input.allowed_cidrs.is_empty());
            assert!(input.allowed_hostnames.is_empty());
            assert!(input.allowed_protocols.is_empty());
            assert!(input.allowed_ports.is_empty());
        }

        #[test]
        fn restricted_policy_form_preserves_configured_values() {
            let policy = TargetPolicy {
                allowed_cidrs: vec!["10.0.0.0/8".to_owned()],
                allowed_hostnames: vec!["*.internal.example".to_owned()],
                allowed_protocols: vec!["https".to_owned(), "tcp".to_owned()],
                allowed_ports: vec![443, 5432],
            };
            let form = TargetPolicyForm::from_policy(&policy);
            assert!(form.limit_ip_addresses);
            assert!(form.limit_hostnames);
            assert!(form.limit_protocols);
            assert!(!form.http);
            assert!(form.https);
            assert!(form.tcp);
            assert!(!form.icmp);
            assert!(form.limit_ports);

            let input = form.input();
            assert_eq!(input.allowed_cidrs, "10.0.0.0/8");
            assert_eq!(input.allowed_hostnames, "*.internal.example");
            assert_eq!(input.allowed_protocols, "https,tcp");
            assert_eq!(input.allowed_ports, "443, 5432");
        }

        #[test]
        fn application_icon_is_valid() {
            let icon = window_icon();
            assert!(icon.width > 0);
            assert!(icon.height > 0);
            assert_eq!(icon.rgba.len(), (icon.width * icon.height * 4) as usize);
        }

        #[test]
        fn interface_follows_the_system_theme() {
            let context = egui::Context::default();
            configure_style(&context);
            assert_eq!(
                context.options(|options| options.theme_preference),
                ThemePreference::System
            );

            for theme in [Theme::Light, Theme::Dark] {
                context.begin_pass(egui::RawInput {
                    system_theme: Some(theme),
                    ..Default::default()
                });
                assert_eq!(context.theme(), theme);
                let mut output = context.end_pass();
                output.textures_delta.clear();
            }
        }

        #[test]
        fn interface_has_cohesive_light_and_dark_styles() {
            let context = egui::Context::default();
            configure_style(&context);

            for theme in [Theme::Light, Theme::Dark] {
                let palette = ThemePalette::for_theme(theme);
                let style = context.style_of(theme);
                assert_eq!(style.visuals.dark_mode, theme == Theme::Dark);
                assert_eq!(style.visuals.panel_fill, palette.background);
                assert_eq!(style.visuals.window_fill, palette.background);
                assert_eq!(
                    style.visuals.text_edit_bg_color,
                    Some(palette.input_background)
                );
                assert_eq!(style.visuals.override_text_color, None);
                assert_eq!(
                    style.visuals.widgets.active.fg_stroke.color,
                    palette.primary_foreground
                );
                assert_eq!(
                    style.visuals.widgets.noninteractive.fg_stroke.color,
                    palette.text
                );
                assert_eq!(style.visuals.disabled_alpha, 0.6);
            }
        }

        #[test]
        fn theme_colors_keep_text_readable() {
            for palette in [ThemePalette::LIGHT, ThemePalette::DARK] {
                for (foreground, background) in [
                    (palette.text, palette.background),
                    (palette.text, palette.surface),
                    (palette.text, palette.input_background),
                    (palette.muted, palette.background),
                    (palette.muted, palette.surface),
                    (palette.primary_foreground, palette.primary),
                    (palette.success, palette.success_background),
                    (palette.danger, palette.danger_background),
                ] {
                    let contrast = contrast_ratio(foreground, background);
                    assert!(
                        contrast >= 4.5,
                        "contrast ratio {contrast} is below 4.5 for {foreground:?} on {background:?}"
                    );
                }
            }
        }

        fn contrast_ratio(first: Color32, second: Color32) -> f32 {
            let first_luminance = relative_luminance(first);
            let second_luminance = relative_luminance(second);
            let lighter = first_luminance.max(second_luminance);
            let darker = first_luminance.min(second_luminance);
            (lighter + 0.05) / (darker + 0.05)
        }

        fn relative_luminance(color: Color32) -> f32 {
            let [red, green, blue, _] = color.to_array();
            0.2126 * linear_component(red)
                + 0.7152 * linear_component(green)
                + 0.0722 * linear_component(blue)
        }

        fn linear_component(value: u8) -> f32 {
            let component = f32::from(value) / 255.0;
            if component <= 0.04045 {
                component / 12.92
            } else {
                ((component + 0.055) / 1.055).powf(2.4)
            }
        }
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
