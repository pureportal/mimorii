pub mod activity;
pub mod diagnostics;
pub mod logs;
pub mod network;
pub mod onboarding;
pub mod overview;
pub mod settings;

use eframe::egui::{self, Align, Layout, RichText, Vec2};

use crate::model::{CheckActivity, format_age};
use crate::theme::Palette;
use crate::widgets;

const STATUS_WIDTH: f32 = 104.0;
const KIND_WIDTH: f32 = 84.0;
const RESULT_WIDTH: f32 = 170.0;
const AGE_WIDTH: f32 = 112.0;

pub fn checks_table<'a>(ui: &mut egui::Ui, checks: impl IntoIterator<Item = &'a CheckActivity>) {
    let palette = Palette::of(ui);
    let target_width =
        (ui.available_width() - STATUS_WIDTH - KIND_WIDTH - RESULT_WIDTH - AGE_WIDTH - 32.0)
            .max(120.0);
    header_row(ui, palette, target_width);
    for (index, check) in checks.into_iter().enumerate() {
        if index > 0 {
            ui.separator();
        }
        ui.horizontal(|ui| {
            column(ui, STATUS_WIDTH, |ui| {
                widgets::pill(ui, check.status.tone(), check.status.label());
            });
            column(ui, KIND_WIDTH, |ui| {
                ui.label(RichText::new(check.kind_label()).color(palette.text));
            });
            column(ui, target_width, |ui| {
                ui.add(
                    egui::Label::new(RichText::new(&check.target).color(palette.text)).truncate(),
                )
                .on_hover_text(&check.target);
            });
            let result = check.result_label();
            column(ui, RESULT_WIDTH, |ui| {
                ui.add(egui::Label::new(RichText::new(&result).color(palette.muted)).truncate())
                    .on_hover_text(&result);
            });
            column(ui, AGE_WIDTH, |ui| {
                ui.label(
                    RichText::new(format_age(check.checked_seconds_ago))
                        .size(13.0)
                        .color(palette.muted),
                );
            });
        });
    }
}

fn header_row(ui: &mut egui::Ui, palette: Palette, target_width: f32) {
    ui.horizontal(|ui| {
        for (label, width) in [
            ("Status", STATUS_WIDTH),
            ("Check", KIND_WIDTH),
            ("Target", target_width),
            ("Result", RESULT_WIDTH),
            ("When", AGE_WIDTH),
        ] {
            column(ui, width, |ui| {
                ui.label(
                    RichText::new(label)
                        .size(12.0)
                        .strong()
                        .color(palette.muted),
                );
            });
        }
    });
    ui.separator();
}

fn column(ui: &mut egui::Ui, width: f32, add_contents: impl FnOnce(&mut egui::Ui)) {
    ui.allocate_ui_with_layout(
        Vec2::new(width, 28.0),
        Layout::left_to_right(Align::Center),
        |ui| {
            ui.set_width(width);
            add_contents(ui);
        },
    );
}

pub fn busy_indicator(ui: &mut egui::Ui, label: Option<&str>) {
    let Some(label) = label else {
        return;
    };
    let palette = Palette::of(ui);
    ui.add(egui::Spinner::new().color(palette.muted).size(16.0));
    ui.label(RichText::new(label).size(13.0).color(palette.muted));
}
