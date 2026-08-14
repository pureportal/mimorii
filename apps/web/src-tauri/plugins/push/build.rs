const COMMANDS: &[&str] = &[
    "status",
    "mark_permission_requested",
    "requestPermissions",
    "enable",
    "disable",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
