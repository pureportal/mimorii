use eframe::egui::{self, RichText};

use crate::agent::{Request, Task};
use crate::app::AgentApp;
use crate::model::{AgentStatus, ServiceState};
use crate::theme::{Palette, Tone};
use crate::widgets;

pub fn show(app: &mut AgentApp, ui: &mut egui::Ui, status: &AgentStatus) {
    let palette = Palette::of(ui);
    ui.add_space(36.0);
    ui.vertical_centered(|ui| {
        ui.set_max_width(480.0);
        ui.label(
            RichText::new("Connect this computer")
                .size(26.0)
                .strong()
                .color(palette.text),
        );
        ui.add_space(6.0);
        widgets::muted(ui, "Use an enrollment key from Agents in Mimorii.");
        ui.add_space(22.0);
    });
    ui.vertical_centered(|ui| {
        ui.set_max_width(480.0);
        if let Some(error) = status.configuration_error.as_ref() {
            widgets::banner(
                ui,
                Tone::Danger,
                "The saved configuration is invalid",
                Some(error),
                None,
            );
            ui.add_space(12.0);
        }
        if status.service == ServiceState::NotInstalled {
            widgets::banner(
                ui,
                Tone::Danger,
                "The Mimorii Agent service isn't installed",
                Some("Reinstall Mimorii Agent to register the Windows service."),
                None,
            );
            ui.add_space(12.0);
        }
        widgets::card(palette).show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.with_layout(egui::Layout::top_down(egui::Align::Min), |ui| {
                enrollment_fields(app, ui);
            });
        });
    });
}

pub fn enrollment_fields(app: &mut AgentApp, ui: &mut egui::Ui) {
    widgets::text_field(
        ui,
        "Server URL",
        &mut app.enrollment.server_url,
        "https://mimorii.example.com/api",
        false,
        None,
    );
    ui.add_space(12.0);
    let key = widgets::text_field(
        ui,
        "Enrollment key",
        &mut app.enrollment.key,
        "mim_agent_…",
        true,
        None,
    );
    ui.add_space(16.0);
    let ready =
        !app.enrollment.server_url.trim().is_empty() && !app.enrollment.key.trim().is_empty();
    let enabled = ready && !app.is_busy();
    let label = if app.is_pending(Task::Enroll) {
        "Activating…"
    } else if app.enrolled() {
        "Update enrollment"
    } else {
        "Activate agent"
    };
    let submitted = key.lost_focus() && ui.input(|input| input.key_pressed(egui::Key::Enter));
    let clicked = widgets::wide_primary_button(ui, label, enabled).clicked();
    if enabled && (clicked || submitted) {
        app.request(Request::Enroll {
            server_url: app.enrollment.server_url.trim().to_owned(),
            key: app.enrollment.key.trim().to_owned(),
        });
    }
}
