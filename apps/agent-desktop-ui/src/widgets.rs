use eframe::egui::{
    self, Button, Color32, CornerRadius, Frame, Margin, Response, RichText, Sense, Stroke,
    TextEdit, Vec2, WidgetInfo, WidgetType,
};

use crate::theme::{Palette, Tone};

pub fn card(palette: Palette) -> Frame {
    Frame::new()
        .fill(palette.surface)
        .stroke(Stroke::new(1.0, palette.line))
        .corner_radius(CornerRadius::same(14))
        .inner_margin(Margin::same(18))
}

pub fn tinted_card(palette: Palette, tone: Tone) -> Frame {
    let (fill, line) = palette.tone_background(tone);
    Frame::new()
        .fill(fill)
        .stroke(Stroke::new(1.0, line))
        .corner_radius(CornerRadius::same(12))
        .inner_margin(Margin::symmetric(16, 12))
}

pub fn page_header(ui: &mut egui::Ui, title: &str, actions: impl FnOnce(&mut egui::Ui)) {
    let palette = Palette::of(ui);
    ui.horizontal(|ui| {
        ui.label(RichText::new(title).size(24.0).strong().color(palette.text));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), actions);
    });
    ui.add_space(16.0);
}

pub fn section_title(ui: &mut egui::Ui, title: &str) {
    let palette = Palette::of(ui);
    ui.label(RichText::new(title).size(16.0).strong().color(palette.text));
    ui.add_space(10.0);
}

pub fn muted(ui: &mut egui::Ui, text: impl Into<String>) -> Response {
    let palette = Palette::of(ui);
    ui.label(RichText::new(text).size(13.0).color(palette.muted))
}

fn primary(palette: Palette, label: &str, enabled: bool) -> Button<'static> {
    if enabled {
        Button::new(
            RichText::new(label.to_owned())
                .strong()
                .color(palette.primary_foreground),
        )
        .fill(palette.primary)
        .stroke(Stroke::NONE)
    } else {
        Button::new(label.to_owned())
            .fill(palette.surface_muted)
            .stroke(Stroke::new(1.0, palette.line))
    }
}

pub fn primary_button(ui: &mut egui::Ui, label: &str, enabled: bool) -> Response {
    let palette = Palette::of(ui);
    ui.add_enabled(
        enabled,
        primary(palette, label, enabled).min_size(Vec2::new(0.0, 38.0)),
    )
}

pub fn wide_primary_button(ui: &mut egui::Ui, label: &str, enabled: bool) -> Response {
    let palette = Palette::of(ui);
    ui.add_enabled_ui(enabled, |ui| {
        ui.add_sized(
            [ui.available_width(), 42.0],
            primary(palette, label, enabled),
        )
    })
    .inner
}

pub fn secondary_button(ui: &mut egui::Ui, label: &str, enabled: bool) -> Response {
    let palette = Palette::of(ui);
    ui.add_enabled(
        enabled,
        Button::new(RichText::new(label).color(palette.text))
            .fill(palette.surface)
            .stroke(Stroke::new(1.0, palette.line))
            .min_size(Vec2::new(0.0, 38.0)),
    )
}

pub fn danger_button(ui: &mut egui::Ui, label: &str, enabled: bool) -> Response {
    let palette = Palette::of(ui);
    ui.add_enabled(
        enabled,
        Button::new(RichText::new(label).strong().color(palette.danger))
            .fill(palette.danger_background)
            .stroke(Stroke::new(1.0, palette.danger_line))
            .min_size(Vec2::new(0.0, 38.0)),
    )
}

pub fn link_button(ui: &mut egui::Ui, label: &str) -> Response {
    let palette = Palette::of(ui);
    ui.add(
        Button::new(RichText::new(label).color(palette.primary_text))
            .frame(false)
            .min_size(Vec2::new(0.0, 24.0)),
    )
}

pub fn chip(ui: &mut egui::Ui, selected: bool, label: &str) -> Response {
    let palette = Palette::of(ui);
    let text = RichText::new(label).color(if selected {
        palette.primary_text
    } else {
        palette.text
    });
    let response = ui.add(
        Button::new(if selected { text.strong() } else { text })
            .fill(if selected {
                palette.primary_soft
            } else {
                palette.surface
            })
            .stroke(Stroke::new(
                1.0,
                if selected {
                    palette.primary
                } else {
                    palette.line
                },
            ))
            .corner_radius(CornerRadius::same(255))
            .min_size(Vec2::new(0.0, 32.0)),
    );
    response.widget_info(|| WidgetInfo::selected(WidgetType::Button, true, selected, label));
    response
}

pub fn switch(ui: &mut egui::Ui, on: &mut bool, label: &str) -> Response {
    let palette = Palette::of(ui);
    ui.horizontal(|ui| {
        let (rect, mut response) = ui.allocate_exact_size(Vec2::new(38.0, 22.0), Sense::click());
        let label_response = ui.add(
            egui::Label::new(RichText::new(label).color(palette.text))
                .selectable(false)
                .sense(Sense::click()),
        );
        if response.clicked() || label_response.clicked() {
            *on = !*on;
            response.mark_changed();
        }
        let enabled = ui.is_enabled();
        let state = *on;
        response.widget_info(|| WidgetInfo::selected(WidgetType::Checkbox, enabled, state, label));
        let progress = ui.ctx().animate_bool_responsive(response.id, state);
        let track = if state { palette.primary } else { palette.line };
        ui.painter()
            .rect_filled(rect, CornerRadius::same(11), track);
        let knob = egui::lerp((rect.left() + 11.0)..=(rect.right() - 11.0), progress);
        ui.painter()
            .circle_filled(egui::pos2(knob, rect.center().y), 8.0, Color32::WHITE);
        response
    })
    .inner
}

pub fn status_dot(ui: &mut egui::Ui, color: Color32, radius: f32) {
    let (rect, _) = ui.allocate_exact_size(Vec2::splat(radius * 2.0 + 2.0), Sense::hover());
    ui.painter().circle_filled(rect.center(), radius, color);
}

pub fn pill(ui: &mut egui::Ui, tone: Tone, label: &str) -> Response {
    let palette = Palette::of(ui);
    let (fill, line) = palette.tone_background(tone);
    Frame::new()
        .fill(fill)
        .stroke(Stroke::new(1.0, line))
        .corner_radius(CornerRadius::same(255))
        .inner_margin(Margin::symmetric(9, 3))
        .show(ui, |ui| {
            ui.spacing_mut().interact_size.y = 0.0;
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 5.0;
                status_dot(ui, palette.tone(tone), 3.5);
                ui.label(
                    RichText::new(label)
                        .size(12.0)
                        .strong()
                        .color(palette.tone(tone)),
                );
            });
        })
        .response
}

pub fn outcome_icon(ui: &mut egui::Ui, tone: Tone) {
    let palette = Palette::of(ui);
    let symbol = match tone {
        Tone::Success => "✔",
        Tone::Warning => "⚠",
        Tone::Danger => "✖",
        Tone::Neutral => "•",
    };
    ui.label(
        RichText::new(symbol)
            .size(15.0)
            .strong()
            .color(palette.tone(tone)),
    );
}

pub fn metric(ui: &mut egui::Ui, width: f32, label: &str, value: &str, tone: Option<Tone>) {
    let palette = Palette::of(ui);
    card(palette)
        .inner_margin(Margin::symmetric(16, 14))
        .show(ui, |ui| {
            ui.set_width(width - 34.0);
            ui.vertical(|ui| {
                ui.label(RichText::new(label).size(12.5).color(palette.muted));
                ui.add_space(2.0);
                let color = tone.map_or(palette.text, |tone| palette.tone(tone));
                ui.add(
                    egui::Label::new(RichText::new(value).size(18.0).strong().color(color))
                        .truncate(),
                );
            });
        });
}

pub fn banner(
    ui: &mut egui::Ui,
    tone: Tone,
    title: &str,
    detail: Option<&str>,
    action: Option<&str>,
) -> bool {
    let palette = Palette::of(ui);
    let mut clicked = false;
    tinted_card(palette, tone).show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            outcome_icon(ui, tone);
            ui.vertical(|ui| {
                let color = if tone == Tone::Neutral {
                    palette.text
                } else {
                    palette.tone(tone)
                };
                ui.label(RichText::new(title).strong().color(color));
                if let Some(detail) = detail {
                    ui.add(
                        egui::Label::new(RichText::new(detail).size(13.0).color(palette.text))
                            .wrap(),
                    );
                }
            });
            if let Some(action) = action {
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    clicked = secondary_button(ui, action, true).clicked();
                });
            }
        });
    });
    clicked
}

pub fn text_field(
    ui: &mut egui::Ui,
    label: &str,
    value: &mut String,
    hint: &str,
    password: bool,
    error: Option<&str>,
) -> Response {
    let palette = Palette::of(ui);
    ui.label(RichText::new(label).strong().size(13.0).color(palette.text));
    ui.add_space(4.0);
    let response = ui.add(
        TextEdit::singleline(value)
            .password(password)
            .hint_text(hint)
            .margin(Margin::symmetric(12, 9))
            .background_color(palette.input_background)
            .desired_width(f32::INFINITY),
    );
    if let Some(error) = error {
        ui.add_space(2.0);
        ui.label(RichText::new(error).size(12.5).color(palette.danger));
    }
    response
}

pub fn empty_state(ui: &mut egui::Ui, title: &str, detail: &str) {
    let palette = Palette::of(ui);
    ui.vertical_centered(|ui| {
        ui.add_space(28.0);
        ui.label(RichText::new(title).size(16.0).strong().color(palette.text));
        ui.add_space(4.0);
        ui.label(RichText::new(detail).size(13.0).color(palette.muted));
        ui.add_space(28.0);
    });
}

pub fn key_value(ui: &mut egui::Ui, label: &str, value: impl FnOnce(&mut egui::Ui)) {
    let palette = Palette::of(ui);
    ui.horizontal(|ui| {
        ui.allocate_ui_with_layout(
            Vec2::new(150.0, 28.0),
            egui::Layout::left_to_right(egui::Align::Center),
            |ui| {
                ui.set_min_width(150.0);
                ui.label(RichText::new(label).size(13.0).color(palette.muted));
            },
        );
        value(ui);
    });
}
