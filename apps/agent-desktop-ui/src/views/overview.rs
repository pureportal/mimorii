use eframe::egui::{self, Align, Layout, RichText};

use crate::agent::{Request, Task};
use crate::app::{AgentApp, Page};
use crate::model::{AgentStatus, CheckStatus, ServiceState, format_age};
use crate::theme::{Palette, Tone};
use crate::views::{self, onboarding};
use crate::widgets;

const RECENT_PREVIEW: usize = 6;

pub fn show(app: &mut AgentApp, ui: &mut egui::Ui) {
    let Some(status) = app.status.clone() else {
        loading_or_error(app, ui);
        return;
    };
    if !status.enrolled {
        onboarding::show(app, ui, &status);
        return;
    }
    widgets::page_header(ui, "Overview", |ui| {
        if widgets::secondary_button(ui, "Refresh", !app.is_pending(Task::Refresh)).clicked() {
            app.request(Request::Refresh);
        }
        views::busy_indicator(ui, app.busy_label());
    });
    service_card(app, ui, &status);
    attention(app, ui, &status);
    ui.add_space(14.0);
    metrics(ui, &status);
    ui.add_space(14.0);
    recent_checks(app, ui, &status);
}

fn loading_or_error(app: &mut AgentApp, ui: &mut egui::Ui) {
    match app.status_error.clone() {
        Some(error) => {
            widgets::page_header(ui, "Overview", |_| {});
            if widgets::banner(
                ui,
                Tone::Danger,
                "Agent status is unavailable",
                Some(&error),
                Some("Try again"),
            ) {
                app.request(Request::Refresh);
            }
        }
        None => {
            ui.add_space(80.0);
            ui.vertical_centered(|ui| {
                ui.add(egui::Spinner::new().size(28.0));
                ui.add_space(8.0);
                widgets::muted(ui, "Loading agent status…");
            });
        }
    }
}

fn service_card(app: &mut AgentApp, ui: &mut egui::Ui, status: &AgentStatus) {
    let palette = Palette::of(ui);
    widgets::card(palette).show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            widgets::status_dot(ui, palette.tone(status.service.tone()), 7.0);
            ui.vertical(|ui| {
                ui.label(
                    RichText::new(format!("Service {}", status.service.label().to_lowercase()))
                        .size(19.0)
                        .strong()
                        .color(palette.text),
                );
                if let Some(server) = status.server_url.as_ref() {
                    ui.horizontal(|ui| {
                        widgets::muted(ui, format!("Connected to {server}"));
                        if server.starts_with("http://") {
                            widgets::pill(ui, Tone::Warning, "Unencrypted");
                        }
                    });
                }
            });
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                service_action(app, ui, status.service);
            });
        });
    });
}

pub fn service_action(app: &mut AgentApp, ui: &mut egui::Ui, service: ServiceState) {
    let idle = !app.is_busy();
    if service.can_stop() && widgets::secondary_button(ui, "Stop service", idle).clicked() {
        app.confirm_stop = true;
    } else if service.can_start() && widgets::primary_button(ui, "Start service", idle).clicked() {
        app.request(Request::StartService);
    }
}

fn attention(app: &mut AgentApp, ui: &mut egui::Ui, status: &AgentStatus) {
    if status.service == ServiceState::NotInstalled {
        ui.add_space(10.0);
        widgets::banner(
            ui,
            Tone::Danger,
            "The Mimorii Agent service isn't installed",
            Some("Reinstall Mimorii Agent to register the Windows service."),
            None,
        );
    }
    if let Some(error) = status
        .runtime
        .as_ref()
        .and_then(|runtime| runtime.last_error.as_ref().map(|error| (error, runtime)))
    {
        let (message, runtime) = error;
        let title = runtime.last_error_seconds_ago.map_or_else(
            || "Last error".to_owned(),
            |seconds| format!("Last error · {}", format_age(seconds)),
        );
        ui.add_space(10.0);
        if widgets::banner(
            ui,
            Tone::Danger,
            &title,
            Some(message),
            Some("Run diagnostics"),
        ) {
            app.diagnostics = None;
            app.navigate(Page::Diagnostics);
        }
    }
    if let Some(update) = app.update.clone().filter(|update| update.update_available) {
        ui.add_space(10.0);
        if widgets::banner(
            ui,
            Tone::Neutral,
            &format!("Version {} is available", update.latest_version),
            Some(&format!("Installed: {}", update.current_version)),
            Some("Install update"),
        ) {
            app.request(Request::InstallUpdate);
        }
    }
}

fn metrics(ui: &mut egui::Ui, status: &AgentStatus) {
    let runtime = status.runtime.as_ref();
    let columns = if ui.available_width() > 680.0 {
        4.0
    } else {
        2.0
    };
    let width = (ui.available_width() - (columns - 1.0) * 10.0) / columns;
    let last_contact = runtime
        .and_then(|runtime| runtime.last_contact_seconds_ago)
        .map_or("Never".to_owned(), format_age);
    let contact_tone = runtime
        .and_then(|runtime| runtime.last_contact_seconds_ago)
        .map_or(Some(Tone::Warning), |seconds| {
            (seconds > 120).then_some(Tone::Warning)
        });
    let last_upload = runtime
        .and_then(|runtime| runtime.last_upload_seconds_ago)
        .map_or("Never".to_owned(), format_age);
    let pending = runtime.map_or(0, |runtime| runtime.pending_snapshots);
    let queue = if pending == 0 {
        "Empty".to_owned()
    } else {
        format!("{pending} waiting")
    };
    let (checks, checks_tone) = latest_cycle(status);
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing = egui::Vec2::splat(10.0);
        widgets::metric(ui, width, "Last contact", &last_contact, contact_tone);
        widgets::metric(ui, width, "Last upload", &last_upload, None);
        widgets::metric(
            ui,
            width,
            "Upload queue",
            &queue,
            (pending > 0).then_some(Tone::Warning),
        );
        widgets::metric(ui, width, "Latest checks", &checks, checks_tone);
    });
}

fn latest_cycle(status: &AgentStatus) -> (String, Option<Tone>) {
    let Some(checks) = status
        .runtime
        .as_ref()
        .map(|runtime| &runtime.recent_checks)
        .filter(|checks| !checks.is_empty())
    else {
        return ("None yet".to_owned(), None);
    };
    let latest = checks
        .iter()
        .map(|check| check.checked_seconds_ago)
        .min()
        .unwrap_or_default();
    let cycle = checks
        .iter()
        .filter(|check| check.checked_seconds_ago == latest)
        .collect::<Vec<_>>();
    let failing = cycle
        .iter()
        .filter(|check| check.status != CheckStatus::Up)
        .count();
    if failing == 0 {
        (format!("{} passing", cycle.len()), Some(Tone::Success))
    } else {
        (
            format!("{failing} of {} failing", cycle.len()),
            Some(Tone::Danger),
        )
    }
}

fn recent_checks(app: &mut AgentApp, ui: &mut egui::Ui, status: &AgentStatus) {
    let palette = Palette::of(ui);
    let checks = status
        .runtime
        .as_ref()
        .map(|runtime| runtime.recent_checks.as_slice())
        .unwrap_or_default();
    widgets::card(palette).show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            widgets::section_title(ui, "Recent checks");
            if !checks.is_empty() {
                ui.with_layout(Layout::right_to_left(Align::Min), |ui| {
                    if widgets::link_button(ui, "View all").clicked() {
                        app.navigate(Page::Activity);
                    }
                });
            }
        });
        if checks.is_empty() {
            widgets::empty_state(
                ui,
                "No checks yet",
                "Checks appear here after Mimorii assigns them to this agent.",
            );
        } else {
            views::checks_table(ui, checks.iter().take(RECENT_PREVIEW));
        }
    });
}
