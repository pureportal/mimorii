use super::{Tone, badge, count, fields, mark, paint, title};
use crate::test_support::plain;

#[test]
fn styled_text_reads_naturally_without_colors() {
    assert_eq!(plain(&badge(Tone::Success, "Running")), "● Running");
    assert_eq!(plain(&mark(Tone::Danger)), "✗");
    assert_eq!(
        plain(&title("Mimorii Agent", "15.0.0")),
        "Mimorii Agent 15.0.0"
    );
    assert_eq!(count(1, "check", "checks"), "1 check");
    assert_eq!(count(3, "check", "checks"), "3 checks");
}

#[test]
fn empty_text_stays_free_of_escape_codes() {
    assert_eq!(paint(super::MUTED, ""), "");
}

#[test]
fn fields_align_their_values() {
    let rendered = plain(&fields(&[
        ("Service", "● Running".to_owned()),
        ("Last contact", "just now".to_owned()),
    ]));
    assert_eq!(
        rendered,
        "  Service       ● Running\n  Last contact  just now"
    );
}
