use eframe::egui;

use crate::agent::{Request, Task};
use crate::app::AgentApp;
use crate::model::CheckStatus;
use crate::theme::Palette;
use crate::views;
use crate::widgets;

pub fn show(app: &mut AgentApp, ui: &mut egui::Ui) {
    let palette = Palette::of(ui);
    widgets::page_header(ui, "Activity", |ui| {
        if widgets::secondary_button(ui, "Refresh", !app.is_pending(Task::Refresh)).clicked() {
            app.request(Request::Refresh);
        }
    });
    let checks = app
        .status
        .as_ref()
        .and_then(|status| status.runtime.as_ref())
        .map(|runtime| runtime.recent_checks.clone())
        .unwrap_or_default();
    let problems = checks
        .iter()
        .filter(|check| check.status != CheckStatus::Up)
        .count();
    ui.horizontal(|ui| {
        for (problems_only, label) in [
            (false, format!("All  {}", checks.len())),
            (true, format!("Problems  {problems}")),
        ] {
            if widgets::chip(ui, app.activity_problems_only == problems_only, &label).clicked() {
                app.activity_problems_only = problems_only;
            }
        }
    });
    ui.add_space(12.0);
    let visible = checks
        .iter()
        .filter(|check| !app.activity_problems_only || check.status != CheckStatus::Up)
        .collect::<Vec<_>>();
    widgets::card(palette).show(ui, |ui| {
        ui.set_width(ui.available_width());
        if visible.is_empty() {
            let (title, detail) = if checks.is_empty() {
                (
                    "No checks yet",
                    "Checks appear here after Mimorii assigns them to this agent.",
                )
            } else {
                ("No problems", "Every recent check passed.")
            };
            widgets::empty_state(ui, title, detail);
        } else {
            views::checks_table(ui, visible);
        }
    });
}
