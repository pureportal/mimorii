use super::{styled_line, tail};
use crate::test_support::plain;

#[test]
fn tail_returns_the_most_recent_lines() {
    let content = "one\ntwo\nthree\nfour\n";
    assert_eq!(tail(content, 2), ["three", "four"]);
    assert_eq!(tail(content, 10), ["one", "two", "three", "four"]);
    assert!(tail("", 5).is_empty());
}

#[test]
fn log_levels_are_highlighted_without_changing_the_text() {
    let error = "2026-11-12T10:00:00Z ERROR trigger poll failed";
    assert_eq!(plain(&styled_line(error)), error);
    assert_ne!(styled_line(error), error);
    assert_eq!(
        plain(&styled_line("2026-11-12T10:00:00Z INFO agent started")),
        "2026-11-12T10:00:00Z INFO  agent started"
    );
    assert_eq!(styled_line("unstructured"), "unstructured");
}
