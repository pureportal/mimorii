const COMMANDS: &[&str] = &[
    "status",
    "mark_permission_requested",
    "requestPermissions",
    "enable",
    "disable",
    "open_settings",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
