use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use eframe::egui::{
    self, Align, Align2, Button, CornerRadius, Frame, Layout, Margin, RichText, ScrollArea, Stroke,
    Vec2, ViewportBuilder,
};

use crate::agent::{Event, Request, Task, Worker};
use crate::model::{AgentStatus, DoctorReport, UpdateStatus};
use crate::policy_form::PolicyForm;
use crate::theme::{self, Palette, Tone};
use crate::views;
use crate::widgets;

const REFRESH_INTERVAL: Duration = Duration::from_secs(10);
const UPDATE_CHECK_INTERVAL: Duration = Duration::from_secs(30 * 60);
const SUCCESS_TOAST_DURATION: Duration = Duration::from_secs(4);
pub const DEFAULT_SERVER_URL: &str = "https://mimorii.app/api";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Page {
    Overview,
    Activity,
    Network,
    Diagnostics,
    Logs,
    Settings,
}

impl Page {
    const ALL: [Self; 6] = [
        Self::Overview,
        Self::Activity,
        Self::Network,
        Self::Diagnostics,
        Self::Logs,
        Self::Settings,
    ];

    fn label(self) -> &'static str {
        match self {
            Self::Overview => "Overview",
            Self::Activity => "Activity",
            Self::Network => "Network access",
            Self::Diagnostics => "Diagnostics",
            Self::Logs => "Logs",
            Self::Settings => "Settings",
        }
    }

    fn icon(self) -> &'static str {
        match self {
            Self::Overview => "🏠",
            Self::Activity => "📈",
            Self::Network => "🌐",
            Self::Diagnostics => "🔧",
            Self::Logs => "📄",
            Self::Settings => "⚙",
        }
    }

    fn requires_enrollment(self) -> bool {
        matches!(self, Self::Activity | Self::Network)
    }
}

pub struct EnrollmentForm {
    pub server_url: String,
    pub key: String,
}

struct Toast {
    tone: Tone,
    message: String,
    shown_at: Instant,
}

pub struct AgentApp {
    worker: Worker,
    brand: egui::TextureHandle,
    pub page: Page,
    pub status: Option<AgentStatus>,
    pub status_error: Option<String>,
    pub update: Option<UpdateStatus>,
    pub update_error: Option<String>,
    pub diagnostics: Option<DoctorReport>,
    pub logs: Option<String>,
    pub logs_error: Option<String>,
    pub enrollment: EnrollmentForm,
    pub network: PolicyForm,
    pub network_dirty: bool,
    pub activity_problems_only: bool,
    pub logs_errors_only: bool,
    pub change_enrollment: bool,
    pub confirm_stop: bool,
    pending: Vec<Task>,
    toast: Option<Toast>,
    received_status: bool,
    next_refresh: Instant,
    next_update_check: Instant,
}

impl AgentApp {
    fn new(context: &eframe::CreationContext<'_>) -> Self {
        theme::configure(&context.egui_ctx);
        let icon = window_icon();
        let brand = context.egui_ctx.load_texture(
            "mimorii-brand",
            egui::ColorImage::from_rgba_unmultiplied(
                [icon.width as usize, icon.height as usize],
                &icon.rgba,
            ),
            egui::TextureOptions::LINEAR,
        );
        let mut app = Self {
            worker: Worker::start(context.egui_ctx.clone()),
            brand,
            page: Page::Overview,
            status: None,
            status_error: None,
            update: None,
            update_error: None,
            diagnostics: None,
            logs: None,
            logs_error: None,
            enrollment: EnrollmentForm {
                server_url: DEFAULT_SERVER_URL.to_owned(),
                key: String::new(),
            },
            network: PolicyForm::default(),
            network_dirty: false,
            activity_problems_only: false,
            logs_errors_only: false,
            change_enrollment: false,
            confirm_stop: false,
            pending: Vec::new(),
            toast: None,
            received_status: false,
            next_refresh: Instant::now(),
            next_update_check: Instant::now(),
        };
        app.request(Request::Refresh);
        app
    }

    pub fn request(&mut self, request: Request) {
        let task = request.task();
        if self.is_pending(task) {
            return;
        }
        if self.worker.send(request) {
            self.pending.push(task);
        } else {
            self.notify(Tone::Danger, "The agent worker stopped. Restart the app.");
        }
    }

    pub fn is_pending(&self, task: Task) -> bool {
        self.pending.contains(&task)
    }

    pub fn busy_label(&self) -> Option<&'static str> {
        self.pending
            .iter()
            .find(|task| !task.is_background())
            .map(|task| task.pending_label())
    }

    pub fn is_busy(&self) -> bool {
        self.busy_label().is_some()
    }

    pub fn enrolled(&self) -> bool {
        self.status.as_ref().is_some_and(|status| status.enrolled)
    }

    pub fn navigate(&mut self, page: Page) {
        self.page = page;
        match page {
            Page::Diagnostics if self.diagnostics.is_none() => {
                self.request(Request::RunDiagnostics)
            }
            Page::Logs => self.request(Request::LoadLogs),
            _ => {}
        }
    }

    pub fn notify(&mut self, tone: Tone, message: impl Into<String>) {
        self.toast = Some(Toast {
            tone,
            message: message.into(),
            shown_at: Instant::now(),
        });
    }

    pub fn reset_network_form(&mut self) {
        let policy = self
            .status
            .as_ref()
            .and_then(|status| status.target_policy.clone())
            .unwrap_or_default();
        self.network = PolicyForm::from_policy(&policy);
        self.network_dirty = false;
    }

    pub fn open_log(&mut self) {
        if let Some(path) = self.log_path() {
            self.launch("notepad.exe", [path.as_os_str().to_owned()]);
        }
    }

    pub fn show_log_folder(&mut self) {
        if let Some(path) = self.log_path() {
            let mut argument = std::ffi::OsString::from("/select,");
            argument.push(path.as_os_str());
            self.launch("explorer.exe", [argument]);
        }
    }

    fn log_path(&self) -> Option<std::path::PathBuf> {
        self.status
            .as_ref()
            .map(|status| status.log_path.clone())
            .filter(|path| Path::new(path).is_file())
    }

    fn launch(&mut self, program: &str, arguments: [std::ffi::OsString; 1]) {
        if let Err(error) = Command::new(program).args(arguments).spawn() {
            self.notify(Tone::Danger, format!("Could not open {program}: {error}"));
        }
    }

    fn apply(&mut self, event: Event) {
        match event {
            Event::Status(Ok(status)) => {
                if !self.received_status {
                    if let Some(server_url) = status.server_url.as_ref() {
                        self.enrollment.server_url.clone_from(server_url);
                    }
                    self.received_status = true;
                }
                let refresh_form = !self.network_dirty;
                self.status = Some(*status);
                self.status_error = None;
                if refresh_form {
                    self.reset_network_form();
                }
            }
            Event::Status(Err(error)) => self.status_error = Some(error),
            Event::Update(update) => {
                self.update = Some(update);
                self.update_error = None;
            }
            Event::Diagnostics(report) => self.diagnostics = Some(report),
            Event::Logs(logs) => {
                self.logs = Some(logs);
                self.logs_error = None;
            }
            Event::Succeeded(task, message) => {
                match task {
                    Task::Enroll => {
                        self.enrollment.key.clear();
                        self.change_enrollment = false;
                        self.diagnostics = None;
                    }
                    Task::SaveNetworkAccess => self.reset_network_form(),
                    _ => {}
                }
                self.notify(Tone::Success, message);
            }
            Event::Failed(task, error) => match task {
                Task::Refresh => self.status_error = Some(error),
                Task::LoadLogs => self.logs_error = Some(error),
                Task::CheckForUpdate => self.update_error = Some(error),
                _ => self.notify(Tone::Danger, error),
            },
            Event::Finished(task) => {
                self.pending.retain(|pending| *pending != task);
                if task == Task::Refresh {
                    self.next_refresh = Instant::now() + REFRESH_INTERVAL;
                }
            }
        }
    }

    fn sidebar(&mut self, ui: &mut egui::Ui) {
        let palette = Palette::of(ui);
        ui.horizontal(|ui| {
            ui.add(
                egui::Image::new(&self.brand)
                    .fit_to_exact_size(Vec2::splat(28.0))
                    .corner_radius(CornerRadius::same(7)),
            );
            ui.vertical(|ui| {
                ui.label(
                    RichText::new("Mimorii")
                        .strong()
                        .size(15.0)
                        .color(palette.text),
                );
                ui.label(RichText::new("Agent").size(12.0).color(palette.muted));
            });
        });
        ui.add_space(22.0);
        let enrolled = self.enrolled();
        for page in Page::ALL {
            if page.requires_enrollment() && !enrolled {
                continue;
            }
            let selected = self.page == page;
            let text =
                RichText::new(format!("{}   {}", page.icon(), page.label())).color(if selected {
                    palette.primary_text
                } else {
                    palette.text
                });
            let text = if selected { text.strong() } else { text };
            let button = Button::new(text)
                .fill(if selected {
                    palette.primary_soft
                } else {
                    egui::Color32::TRANSPARENT
                })
                .stroke(Stroke::NONE)
                .corner_radius(CornerRadius::same(9))
                .min_size(Vec2::new(ui.available_width(), 38.0));
            let response = ui.add(button);
            if response.clicked() && !selected {
                self.navigate(page);
            }
            ui.add_space(2.0);
        }
        ui.with_layout(Layout::bottom_up(Align::Min), |ui| {
            if let Some(status) = self.status.as_ref() {
                ui.label(
                    RichText::new(format!("Version {}", status.agent_version))
                        .size(12.0)
                        .color(palette.muted),
                );
                ui.horizontal(|ui| {
                    widgets::status_dot(ui, palette.tone(status.service.tone()), 4.0);
                    ui.label(
                        RichText::new(status.service.label())
                            .size(13.0)
                            .color(palette.text),
                    );
                });
            }
        });
    }

    fn content(&mut self, ui: &mut egui::Ui) {
        if self.page == Page::Logs {
            views::logs::show(self, ui);
            return;
        }
        ScrollArea::vertical()
            .auto_shrink([false, false])
            .show(ui, |ui| {
                ui.set_max_width(ui.available_width().min(980.0));
                match self.page {
                    Page::Overview => views::overview::show(self, ui),
                    Page::Activity => views::activity::show(self, ui),
                    Page::Network => views::network::show(self, ui),
                    Page::Diagnostics => views::diagnostics::show(self, ui),
                    Page::Settings => views::settings::show(self, ui),
                    Page::Logs => {}
                }
                ui.add_space(24.0);
            });
    }

    fn toast(&mut self, context: &egui::Context) {
        let Some(toast) = self.toast.as_ref() else {
            return;
        };
        if toast.tone == Tone::Success {
            let elapsed = toast.shown_at.elapsed();
            if elapsed >= SUCCESS_TOAST_DURATION {
                self.toast = None;
                return;
            }
            context.request_repaint_after(SUCCESS_TOAST_DURATION - elapsed);
        }
        let mut dismissed = false;
        egui::Area::new(egui::Id::new("toast"))
            .anchor(Align2::RIGHT_BOTTOM, [-20.0, -20.0])
            .order(egui::Order::Foreground)
            .show(context, |ui| {
                let palette = Palette::of(ui);
                widgets::tinted_card(palette, toast.tone)
                    .shadow(egui::Shadow {
                        offset: [0, 4],
                        blur: 16,
                        spread: 0,
                        color: egui::Color32::from_black_alpha(40),
                    })
                    .show(ui, |ui| {
                        ui.set_max_width(380.0);
                        ui.horizontal(|ui| {
                            widgets::outcome_icon(ui, toast.tone);
                            ui.add(
                                egui::Label::new(RichText::new(&toast.message).color(palette.text))
                                    .wrap(),
                            );
                            if ui
                                .add(
                                    Button::new(RichText::new("×").color(palette.muted))
                                        .frame(false),
                                )
                                .on_hover_text("Dismiss")
                                .clicked()
                            {
                                dismissed = true;
                            }
                        });
                    });
            });
        if dismissed {
            self.toast = None;
        }
    }

    fn stop_confirmation(&mut self, context: &egui::Context) {
        if !self.confirm_stop {
            return;
        }
        let mut confirmed = false;
        let response = egui::Modal::new(egui::Id::new("confirm-stop"))
            .frame(
                widgets::card(Palette::for_theme(context.theme())).inner_margin(Margin::same(22)),
            )
            .show(context, |ui| {
                let palette = Palette::of(ui);
                ui.set_width(360.0);
                ui.label(
                    RichText::new("Stop the Mimorii Agent service?")
                        .size(17.0)
                        .strong()
                        .color(palette.text),
                );
                ui.add_space(6.0);
                ui.label(
                    RichText::new("Checks and uploads pause until the service starts again.")
                        .color(palette.muted),
                );
                ui.add_space(18.0);
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if widgets::danger_button(ui, "Stop service", true).clicked() {
                        confirmed = true;
                    }
                    if widgets::secondary_button(ui, "Cancel", true).clicked() {
                        self.confirm_stop = false;
                    }
                });
            });
        if confirmed {
            self.confirm_stop = false;
            self.request(Request::StopService);
        } else if response.should_close() {
            self.confirm_stop = false;
        }
    }
}

impl eframe::App for AgentApp {
    fn logic(&mut self, context: &egui::Context, _frame: &mut eframe::Frame) {
        for event in self.worker.events() {
            self.apply(event);
        }
        let now = Instant::now();
        if now >= self.next_refresh && !self.is_pending(Task::Refresh) {
            self.next_refresh = now + REFRESH_INTERVAL;
            self.request(Request::Refresh);
            if self.page == Page::Logs {
                self.request(Request::LoadLogs);
            }
        }
        if now >= self.next_update_check {
            self.next_update_check = now + UPDATE_CHECK_INTERVAL;
            self.request(Request::CheckForUpdate);
        }
        if !self.enrolled() && self.page.requires_enrollment() && self.status.is_some() {
            self.page = Page::Overview;
        }
        context.request_repaint_after(REFRESH_INTERVAL);
    }

    fn ui(&mut self, root: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let palette = Palette::of(root);
        egui::Panel::left("navigation")
            .exact_size(216.0)
            .resizable(false)
            .frame(
                Frame::new()
                    .fill(palette.sidebar)
                    .stroke(Stroke::new(1.0, palette.line))
                    .inner_margin(Margin::symmetric(14, 20)),
            )
            .show(root, |ui| self.sidebar(ui));
        egui::CentralPanel::default()
            .frame(
                Frame::new()
                    .fill(palette.background)
                    .inner_margin(Margin::symmetric(30, 26)),
            )
            .show(root, |ui| self.content(ui));
        let context = root.ctx().clone();
        self.toast(&context);
        self.stop_confirmation(&context);
    }
}

pub fn run() -> eframe::Result {
    let viewport = ViewportBuilder::default()
        .with_inner_size([980.0, 680.0])
        .with_min_inner_size([780.0, 560.0])
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

pub fn window_icon() -> egui::IconData {
    eframe::icon_data::from_png_bytes(include_bytes!("../../client/src-tauri/icons/icon.png"))
        .expect("Mimorii application icon is invalid")
}

#[cfg(test)]
#[path = "app_tests.rs"]
mod tests;
