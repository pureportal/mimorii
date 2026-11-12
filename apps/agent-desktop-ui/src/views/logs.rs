use eframe::egui::{self, RichText, ScrollArea};

use crate::agent::{Request, Task};
use crate::app::AgentApp;
use crate::theme::{Palette, Tone};
use crate::widgets;

pub fn show(app: &mut AgentApp, ui: &mut egui::Ui) {
    let palette = Palette::of(ui);
    widgets::page_header(ui, "Logs", |ui| {
        if widgets::secondary_button(ui, "Show in folder", true).clicked() {
            app.show_log_folder();
        }
        if widgets::secondary_button(ui, "Open in Notepad", true).clicked() {
            app.open_log();
        }
        if let Some(logs) = app.logs.as_ref()
            && widgets::secondary_button(ui, "Copy", true).clicked()
        {
            ui.ctx().copy_text(logs.clone());
            app.notify(Tone::Success, "Log copied");
        }
        if widgets::secondary_button(ui, "Refresh", !app.is_pending(Task::LoadLogs)).clicked() {
            app.request(Request::LoadLogs);
        }
        widgets::switch(ui, &mut app.logs_errors_only, "Errors only");
    });
    if let Some(error) = app.logs_error.clone() {
        widgets::banner(
            ui,
            Tone::Danger,
            "The log could not be read",
            Some(&error),
            None,
        );
        return;
    }
    let Some(logs) = app.logs.as_ref() else {
        ui.add(egui::Spinner::new());
        return;
    };
    let lines = logs
        .lines()
        .filter(|line| !app.logs_errors_only || line.contains(" ERROR "))
        .collect::<Vec<_>>();
    widgets::card(palette).show(ui, |ui| {
        ui.set_width(ui.available_width());
        if lines.is_empty() {
            widgets::empty_state(
                ui,
                if app.logs_errors_only {
                    "No errors"
                } else {
                    "No log entries yet"
                },
                if app.logs_errors_only {
                    "The latest log entries contain no errors."
                } else {
                    "Entries appear after the service starts."
                },
            );
            return;
        }
        ScrollArea::vertical()
            .auto_shrink([false, false])
            .stick_to_bottom(true)
            .show(ui, |ui| {
                for line in lines {
                    let color = if line.contains(" ERROR ") {
                        palette.danger
                    } else {
                        palette.text
                    };
                    ui.add(egui::Label::new(RichText::new(line).monospace().color(color)).wrap());
                }
            });
    });
}
