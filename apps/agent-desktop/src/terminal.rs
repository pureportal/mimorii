use std::fmt::Display;

use anstyle::{AnsiColor, Style};

pub(crate) const STRONG: Style = Style::new().bold();
pub(crate) const MUTED: Style = Style::new().dimmed();

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Tone {
    Success,
    Warning,
    Danger,
    Neutral,
}

impl Tone {
    fn style(self) -> Style {
        match self {
            Self::Success => AnsiColor::Green.on_default(),
            Self::Warning => AnsiColor::Yellow.on_default(),
            Self::Danger => AnsiColor::Red.on_default(),
            Self::Neutral => MUTED,
        }
    }

    fn symbol(self) -> &'static str {
        match self {
            Self::Success => "✓",
            Self::Warning => "!",
            Self::Danger => "✗",
            Self::Neutral => "•",
        }
    }
}

pub(crate) fn paint(style: Style, text: impl Display) -> String {
    let text = text.to_string();
    if text.is_empty() {
        return text;
    }
    format!("{style}{text}{style:#}")
}

pub(crate) fn tinted(tone: Tone, text: impl Display) -> String {
    paint(tone.style(), text)
}

pub(crate) fn mark(tone: Tone) -> String {
    paint(tone.style().bold(), tone.symbol())
}

pub(crate) fn badge(tone: Tone, text: &str) -> String {
    paint(tone.style(), format!("● {text}"))
}

pub(crate) fn title(name: &str, detail: &str) -> String {
    if detail.is_empty() {
        paint(STRONG, name)
    } else {
        format!("{} {}", paint(STRONG, name), paint(MUTED, detail))
    }
}

pub(crate) fn fields(rows: &[(&str, String)]) -> String {
    let width = rows
        .iter()
        .map(|(label, _)| label.chars().count())
        .max()
        .unwrap_or(0);
    rows.iter()
        .map(|(label, value)| format!("  {}  {value}", paint(MUTED, format!("{label:<width$}"))))
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn success(message: impl Display) -> String {
    format!("{} {message}", mark(Tone::Success))
}

pub(crate) fn command(text: &str) -> String {
    paint(AnsiColor::Cyan.on_default(), text)
}

pub(crate) fn count(value: usize, singular: &str, plural: &str) -> String {
    format!("{value} {}", if value == 1 { singular } else { plural })
}

#[cfg(test)]
#[path = "terminal_tests.rs"]
mod tests;
