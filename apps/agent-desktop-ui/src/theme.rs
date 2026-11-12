use eframe::egui::{
    self, Color32, CornerRadius, FontId, Stroke, TextStyle, Theme, ThemePreference, Vec2,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tone {
    Success,
    Warning,
    Danger,
    Neutral,
}

#[derive(Clone, Copy)]
pub struct Palette {
    pub background: Color32,
    pub sidebar: Color32,
    pub surface: Color32,
    pub surface_muted: Color32,
    pub input_background: Color32,
    pub text: Color32,
    pub muted: Color32,
    pub line: Color32,
    pub primary: Color32,
    pub primary_hover: Color32,
    pub primary_soft: Color32,
    pub primary_text: Color32,
    pub primary_foreground: Color32,
    pub success: Color32,
    pub success_background: Color32,
    pub success_line: Color32,
    pub warning: Color32,
    pub warning_background: Color32,
    pub warning_line: Color32,
    pub danger: Color32,
    pub danger_background: Color32,
    pub danger_line: Color32,
}

impl Palette {
    pub const LIGHT: Self = Self {
        background: Color32::from_rgb(247, 246, 250),
        sidebar: Color32::from_rgb(240, 238, 245),
        surface: Color32::WHITE,
        surface_muted: Color32::from_rgb(246, 244, 249),
        input_background: Color32::from_rgb(251, 250, 252),
        text: Color32::from_rgb(37, 32, 47),
        muted: Color32::from_rgb(105, 98, 119),
        line: Color32::from_rgb(224, 220, 230),
        primary: Color32::from_rgb(103, 79, 181),
        primary_hover: Color32::from_rgb(91, 67, 166),
        primary_soft: Color32::from_rgb(234, 229, 248),
        primary_text: Color32::from_rgb(91, 67, 166),
        primary_foreground: Color32::WHITE,
        success: Color32::from_rgb(28, 126, 89),
        success_background: Color32::from_rgb(237, 248, 243),
        success_line: Color32::from_rgb(194, 229, 214),
        warning: Color32::from_rgb(146, 88, 13),
        warning_background: Color32::from_rgb(253, 246, 232),
        warning_line: Color32::from_rgb(240, 217, 172),
        danger: Color32::from_rgb(181, 53, 53),
        danger_background: Color32::from_rgb(253, 241, 241),
        danger_line: Color32::from_rgb(239, 204, 204),
    };

    pub const DARK: Self = Self {
        background: Color32::from_rgb(20, 18, 24),
        sidebar: Color32::from_rgb(25, 22, 31),
        surface: Color32::from_rgb(30, 26, 37),
        surface_muted: Color32::from_rgb(40, 34, 47),
        input_background: Color32::from_rgb(24, 21, 29),
        text: Color32::from_rgb(242, 239, 247),
        muted: Color32::from_rgb(182, 174, 194),
        line: Color32::from_rgb(64, 57, 73),
        primary: Color32::from_rgb(114, 82, 199),
        primary_hover: Color32::from_rgb(100, 69, 179),
        primary_soft: Color32::from_rgb(48, 38, 72),
        primary_text: Color32::from_rgb(196, 178, 255),
        primary_foreground: Color32::WHITE,
        success: Color32::from_rgb(105, 214, 166),
        success_background: Color32::from_rgb(22, 52, 42),
        success_line: Color32::from_rgb(43, 90, 73),
        warning: Color32::from_rgb(244, 183, 102),
        warning_background: Color32::from_rgb(56, 42, 22),
        warning_line: Color32::from_rgb(104, 78, 38),
        danger: Color32::from_rgb(255, 146, 146),
        danger_background: Color32::from_rgb(58, 32, 37),
        danger_line: Color32::from_rgb(107, 52, 62),
    };

    pub fn for_theme(theme: Theme) -> Self {
        match theme {
            Theme::Dark => Self::DARK,
            Theme::Light => Self::LIGHT,
        }
    }

    pub fn of(ui: &egui::Ui) -> Self {
        Self::for_theme(Theme::from_dark_mode(ui.visuals().dark_mode))
    }

    pub fn tone(&self, tone: Tone) -> Color32 {
        match tone {
            Tone::Success => self.success,
            Tone::Warning => self.warning,
            Tone::Danger => self.danger,
            Tone::Neutral => self.muted,
        }
    }

    pub fn tone_background(&self, tone: Tone) -> (Color32, Color32) {
        match tone {
            Tone::Success => (self.success_background, self.success_line),
            Tone::Warning => (self.warning_background, self.warning_line),
            Tone::Danger => (self.danger_background, self.danger_line),
            Tone::Neutral => (self.surface_muted, self.line),
        }
    }
}

pub fn configure(context: &egui::Context) {
    context.set_style_of(Theme::Light, style(Theme::Light));
    context.set_style_of(Theme::Dark, style(Theme::Dark));
    context.set_theme(ThemePreference::System);
}

pub fn style(theme: Theme) -> egui::Style {
    let palette = Palette::for_theme(theme);
    let mut style = theme.default_style();
    style.text_styles = [
        (TextStyle::Heading, FontId::proportional(24.0)),
        (TextStyle::Body, FontId::proportional(14.0)),
        (TextStyle::Button, FontId::proportional(14.0)),
        (TextStyle::Small, FontId::proportional(12.0)),
        (TextStyle::Monospace, FontId::monospace(12.5)),
    ]
    .into();
    style.spacing.item_spacing = Vec2::new(8.0, 6.0);
    style.spacing.button_padding = Vec2::new(14.0, 8.0);
    style.spacing.interact_size.y = 36.0;
    style.visuals.override_text_color = None;
    style.visuals.disabled_alpha = 0.6;
    style.visuals.panel_fill = palette.background;
    style.visuals.window_fill = palette.surface;
    style.visuals.window_stroke = Stroke::new(1.0, palette.line);
    style.visuals.window_corner_radius = CornerRadius::same(14);
    style.visuals.extreme_bg_color = palette.input_background;
    style.visuals.text_edit_bg_color = Some(palette.input_background);
    style.visuals.faint_bg_color = palette.surface_muted;
    style.visuals.code_bg_color = palette.surface_muted;
    style.visuals.selection.bg_fill = palette.primary;
    style.visuals.selection.stroke = Stroke::new(1.0, palette.primary_foreground);
    style.visuals.hyperlink_color = palette.primary_text;
    style.visuals.error_fg_color = palette.danger;
    style.visuals.warn_fg_color = palette.warning;
    style.visuals.widgets.noninteractive.fg_stroke = Stroke::new(1.0, palette.text);
    style.visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0, palette.line);
    style.visuals.widgets.inactive.bg_fill = palette.surface;
    style.visuals.widgets.inactive.weak_bg_fill = palette.surface;
    style.visuals.widgets.inactive.bg_stroke = Stroke::new(1.0, palette.line);
    style.visuals.widgets.inactive.fg_stroke = Stroke::new(1.0, palette.text);
    style.visuals.widgets.inactive.corner_radius = CornerRadius::same(9);
    style.visuals.widgets.hovered.bg_fill = palette.surface_muted;
    style.visuals.widgets.hovered.weak_bg_fill = palette.surface_muted;
    style.visuals.widgets.hovered.bg_stroke = Stroke::new(1.0, palette.primary);
    style.visuals.widgets.hovered.fg_stroke = Stroke::new(1.0, palette.text);
    style.visuals.widgets.hovered.corner_radius = CornerRadius::same(9);
    style.visuals.widgets.active.bg_fill = palette.primary_hover;
    style.visuals.widgets.active.weak_bg_fill = palette.primary_hover;
    style.visuals.widgets.active.bg_stroke = Stroke::new(1.0, palette.primary_hover);
    style.visuals.widgets.active.fg_stroke = Stroke::new(1.0, palette.primary_foreground);
    style.visuals.widgets.active.corner_radius = CornerRadius::same(9);
    style
}

#[cfg(test)]
#[path = "theme_tests.rs"]
mod tests;
