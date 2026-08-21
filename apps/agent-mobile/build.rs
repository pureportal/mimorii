const COMMANDS: &[&str] = &[
    "status",
    "enroll",
    "collect_now",
    "open_background_settings",
    "unenroll",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
