const COMMANDS: &[&str] = &["status", "enroll", "collect_now", "unenroll"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
