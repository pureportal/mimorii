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

#[cfg(windows)]
#[test]
fn windows_startup_task_quotes_the_executable_and_runs_the_agent() {
    use std::path::Path;

    assert_eq!(
        super::windows_startup_task(Path::new(r"C:\Program Files\Mimorii\mimorii-agent.exe")),
        r#""C:\Program Files\Mimorii\mimorii-agent.exe" run"#
    );
}
