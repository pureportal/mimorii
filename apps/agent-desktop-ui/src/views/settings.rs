use eframe::egui::{self, RichText};

use crate::agent::{Request, Task};
use crate::app::AgentApp;
use crate::theme::{Palette, Tone};
use crate::views::{onboarding, overview};
use crate::widgets;

pub fn show(app: &mut AgentApp, ui: &mut egui::Ui) {
    widgets::page_header(ui, "Settings", |_| {});
    connection(app, ui);
    ui.add_space(14.0);
    service(app, ui);
    ui.add_space(14.0);
    updates(app, ui);
    ui.add_space(14.0);
    files(app, ui);
}

fn connection(app: &mut AgentApp, ui: &mut egui::Ui) {
    let palette = Palette::of(ui);
    let status = app.status.clone();
    widgets::card(palette).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::section_title(ui, "Connection");
        let server = status.as_ref().and_then(|status| status.server_url.clone());
        widgets::key_value(ui, "Server", |ui| match server.as_ref() {
            Some(server) => {
                ui.label(RichText::new(server).color(palette.text));
                if widgets::link_button(ui, "Copy").clicked() {
                    ui.ctx().copy_text(server.clone());
                    app.notify(Tone::Success, "Server URL copied");
                }
            }
            None => {
                widgets::muted(ui, "Not enrolled");
            }
        });
        widgets::key_value(ui, "Enrollment", |ui| {
            if app.enrolled() {
                widgets::pill(ui, Tone::Success, "Enrolled");
            } else {
                widgets::pill(ui, Tone::Danger, "Not enrolled");
            }
        });
        ui.add_space(10.0);
        if app.change_enrollment || !app.enrolled() {
            onboarding::enrollment_fields(app, ui);
            if app.enrolled() && widgets::link_button(ui, "Cancel").clicked() {
                app.change_enrollment = false;
                app.enrollment.key.clear();
            }
        } else if widgets::secondary_button(ui, "Change enrollment", !app.is_busy()).clicked() {
            app.change_enrollment = true;
        }
    });
}

fn service(app: &mut AgentApp, ui: &mut egui::Ui) {
    let palette = Palette::of(ui);
    let Some(service) = app.status.as_ref().map(|status| status.service) else {
        return;
    };
    widgets::card(palette).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::section_title(ui, "Service");
        ui.horizontal(|ui| {
            widgets::pill(ui, service.tone(), service.label());
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                overview::service_action(app, ui, service);
            });
        });
    });
}

fn updates(app: &mut AgentApp, ui: &mut egui::Ui) {
    let palette = Palette::of(ui);
    let version = app
        .status
        .as_ref()
        .map(|status| status.agent_version.clone())
        .unwrap_or_default();
    let update = app.update.clone();
    let checking = app.is_pending(Task::CheckForUpdate);
    widgets::card(palette).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::section_title(ui, "Updates");
        widgets::key_value(ui, "Installed", |ui| {
            ui.label(RichText::new(&version).color(palette.text));
        });
        widgets::key_value(ui, "Latest", |ui| match (&update, &app.update_error) {
            (_, Some(error)) => {
                ui.add(egui::Label::new(RichText::new(error).color(palette.danger)).wrap());
            }
            (Some(update), None) if update.update_available => {
                ui.label(
                    RichText::new(&update.latest_version)
                        .strong()
                        .color(palette.text),
                );
                widgets::pill(ui, Tone::Warning, "Update available");
            }
            (Some(update), None) => {
                ui.label(RichText::new(&update.latest_version).color(palette.text));
                widgets::pill(ui, Tone::Success, "Up to date");
            }
            (None, None) => {
                widgets::muted(ui, "Not checked yet");
            }
        });
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            let label = if checking { "Checking…" } else { "Check now" };
            if widgets::secondary_button(ui, label, !checking).clicked() {
                app.request(Request::CheckForUpdate);
            }
            if update
                .as_ref()
                .is_some_and(|update| update.update_available)
                && widgets::primary_button(ui, "Install update", !app.is_busy()).clicked()
            {
                app.request(Request::InstallUpdate);
            }
        });
    });
}

fn files(app: &mut AgentApp, ui: &mut egui::Ui) {
    let palette = Palette::of(ui);
    let Some(path) = app
        .status
        .as_ref()
        .map(|status| status.log_path.display().to_string())
    else {
        return;
    };
    widgets::card(palette).show(ui, |ui| {
        ui.set_width(ui.available_width());
        widgets::section_title(ui, "Files");
        widgets::key_value(ui, "Log file", |ui| {
            ui.add(
                egui::Label::new(RichText::new(&path).monospace().color(palette.text)).truncate(),
            );
        });
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            if widgets::secondary_button(ui, "Open log", true).clicked() {
                app.open_log();
            }
            if widgets::secondary_button(ui, "Show in folder", true).clicked() {
                app.show_log_folder();
            }
        });
    });
}
