use std::path::Path;

use super::{LinuxServicePaths, command, systemd_quote, systemd_user_unit_content};

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

#[test]
fn systemd_unit_runs_persistently_with_only_collection_state_writable() {
    let root = std::env::current_dir()
        .unwrap()
        .join("mimorii service test");
    let paths = LinuxServicePaths {
        home: root.join("home"),
        config_home: root.join("config"),
        data_home: root.join("data"),
        collection: root.join("data/agent-desktop/collected-snapshots"),
    };
    let unit = systemd_user_unit_content(&root.join("bin/mimorii-agent-desktop"), &paths).unwrap();

    assert!(unit.contains("Type=exec\nExecStart="));
    assert!(unit.contains(" run\n"));
    assert!(unit.contains("Environment=\"HOME="));
    assert!(unit.contains("Environment=\"XDG_CONFIG_HOME="));
    assert!(unit.contains("Environment=\"XDG_DATA_HOME="));
    assert!(unit.contains("Restart=on-failure\nRestartSec=10s"));
    assert!(unit.contains("ProtectSystem=strict\nProtectHome=read-only"));
    assert!(unit.contains("ReadWritePaths="));
    assert!(unit.contains("collected-snapshots"));
    assert!(unit.contains("StandardOutput=journal\nStandardError=journal"));
    assert!(unit.contains("WantedBy=default.target"));
    assert!(!unit.contains("network-online.target"));
}

#[test]
fn systemd_values_escape_specifiers_and_command_expansion() {
    assert_eq!(
        systemd_quote("/opt/Mimorii $agent%/agent\"bin", true).unwrap(),
        r#""/opt/Mimorii $$agent%%/agent\"bin""#
    );
    assert_eq!(
        systemd_quote("HOME=/home/$agent%", false).unwrap(),
        r#""HOME=/home/$agent%%""#
    );
    assert!(systemd_quote("invalid\nvalue", false).is_err());
}

#[test]
fn systemd_unit_rejects_relative_paths() {
    let paths = LinuxServicePaths {
        home: ".".into(),
        config_home: "config".into(),
        data_home: "data".into(),
        collection: "collection".into(),
    };
    assert!(systemd_user_unit_content(Path::new("agent"), &paths).is_err());
}

#[cfg(target_os = "linux")]
#[test]
fn systemd_analyze_accepts_the_generated_unit() {
    let root = tempfile::tempdir().unwrap();
    let collection = root.path().join("data/agent-desktop/collected-snapshots");
    std::fs::create_dir_all(&collection).unwrap();
    let paths = LinuxServicePaths {
        home: root.path().join("home"),
        config_home: root.path().join("config"),
        data_home: root.path().join("data"),
        collection,
    };
    let content = systemd_user_unit_content(&std::env::current_exe().unwrap(), &paths).unwrap();
    let unit = root.path().join("mimorii-agent-desktop.service");
    std::fs::write(&unit, content).unwrap();
    let output = match std::process::Command::new("systemd-analyze")
        .args(["--user", "verify"])
        .arg(&unit)
        .output()
    {
        Ok(output) => output,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
        Err(error) => panic!("could not run systemd-analyze: {error}"),
    };
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
