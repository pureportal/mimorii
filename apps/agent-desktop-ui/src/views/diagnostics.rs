use eframe::egui::{self, Align, Layout, RichText, Vec2};

use crate::agent::{Request, Task};
use crate::app::AgentApp;
use crate::model::{DoctorReport, Outcome, count_label};
use crate::theme::{Palette, Tone};
use crate::widgets;

pub fn show(app: &mut AgentApp, ui: &mut egui::Ui) {
    let palette = Palette::of(ui);
    let running = app.is_pending(Task::RunDiagnostics);
    widgets::page_header(ui, "Diagnostics", |ui| {
        let label = if running { "Running…" } else { "Run again" };
        if widgets::primary_button(ui, label, !running && !app.is_busy()).clicked() {
            app.request(Request::RunDiagnostics);
        }
        if let Some(report) = app.diagnostics.as_ref()
            && widgets::secondary_button(ui, "Copy report", true).clicked()
        {
            ui.ctx().copy_text(report.text());
            app.notify(Tone::Success, "Report copied");
        }
    });
    let Some(report) = app.diagnostics.clone() else {
        widgets::card(palette).show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.vertical_centered(|ui| {
                ui.add_space(24.0);
                ui.add(egui::Spinner::new().size(24.0));
                ui.add_space(8.0);
                widgets::muted(ui, "Checking enrollment, connection, and service…");
                ui.add_space(24.0);
            });
        });
        return;
    };
    summary(ui, &report);
    ui.add_space(14.0);
    widgets::card(palette).show(ui, |ui| {
        ui.set_width(ui.available_width());
        for (index, check) in report.checks.iter().enumerate() {
            if index > 0 {
                ui.separator();
            }
            ui.horizontal_top(|ui| {
                ui.allocate_ui_with_layout(
                    Vec2::new(26.0, 20.0),
                    Layout::left_to_right(Align::Min),
                    |ui| {
                        ui.set_min_width(26.0);
                        widgets::outcome_icon(ui, check.outcome.tone());
                    },
                );
                ui.allocate_ui_with_layout(
                    Vec2::new(130.0, 20.0),
                    Layout::left_to_right(Align::Min),
                    |ui| {
                        ui.set_min_width(130.0);
                        ui.label(RichText::new(&check.label).strong().color(palette.text));
                    },
                );
                ui.vertical(|ui| {
                    ui.add(
                        egui::Label::new(RichText::new(&check.detail).color(palette.text)).wrap(),
                    );
                    if let Some(hint) = check.hint.as_ref() {
                        ui.add(
                            egui::Label::new(RichText::new(hint).size(13.0).color(palette.muted))
                                .wrap(),
                        );
                    }
                });
            });
        }
    });
}

fn summary(ui: &mut egui::Ui, report: &DoctorReport) {
    let failures = report.count(Outcome::Fail);
    let warnings = report.count(Outcome::Warn);
    let (tone, title) = match (failures, warnings) {
        (0, 0) => (Tone::Success, "Everything looks good".to_owned()),
        (0, warnings) => (Tone::Warning, count_label(warnings, "warning")),
        (failures, _) => (
            Tone::Danger,
            format!("{} found", count_label(failures, "problem")),
        ),
    };
    widgets::banner(ui, tone, &title, None, None);
}
