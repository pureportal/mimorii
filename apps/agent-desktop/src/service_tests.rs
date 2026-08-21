use super::command;

#[test]
fn command_accepts_successful_processes() {
    command("cargo", &["--version"]).unwrap();
}

#[test]
fn command_reports_missing_processes() {
    let error = command("mimorii-command-that-does-not-exist", &[]).unwrap_err();
    assert!(!error.to_string().is_empty());
}

#[test]
fn command_reports_unsuccessful_statuses() {
    #[cfg(windows)]
    let error = command("cmd", &["/C", "exit", "7"]).unwrap_err();
    #[cfg(not(windows))]
    let error = command("sh", &["-c", "exit 7"]).unwrap_err();
    assert!(error.to_string().contains("failed with status"));
}
