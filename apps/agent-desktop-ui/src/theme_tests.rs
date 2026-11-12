use eframe::egui::{self, Color32, Theme, ThemePreference};

use super::{Palette, configure, style};

#[test]
fn interface_follows_the_system_theme() {
    let context = egui::Context::default();
    configure(&context);
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
fn light_and_dark_styles_use_their_palettes() {
    for theme in [Theme::Light, Theme::Dark] {
        let palette = Palette::for_theme(theme);
        let style = style(theme);
        assert_eq!(style.visuals.dark_mode, theme == Theme::Dark);
        assert_eq!(style.visuals.panel_fill, palette.background);
        assert_eq!(
            style.visuals.text_edit_bg_color,
            Some(palette.input_background)
        );
        assert_eq!(style.visuals.override_text_color, None);
        assert_eq!(
            style.visuals.widgets.active.fg_stroke.color,
            palette.primary_foreground
        );
    }
}

#[test]
fn theme_colors_keep_text_readable() {
    for palette in [Palette::LIGHT, Palette::DARK] {
        for (foreground, background) in [
            (palette.text, palette.background),
            (palette.text, palette.sidebar),
            (palette.text, palette.surface),
            (palette.text, palette.input_background),
            (palette.muted, palette.background),
            (palette.muted, palette.surface),
            (palette.primary_text, palette.primary_soft),
            (palette.primary_text, palette.surface),
            (palette.primary_text, palette.background),
            (palette.primary_foreground, palette.primary),
            (palette.success, palette.success_background),
            (palette.warning, palette.warning_background),
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
    let first = relative_luminance(first);
    let second = relative_luminance(second);
    (first.max(second) + 0.05) / (first.min(second) + 0.05)
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
