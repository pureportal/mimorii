#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_push::init());
    #[cfg(feature = "mobile-agent")]
    let builder = builder.plugin(tauri_plugin_agent_mobile::init());
    builder
        .run(tauri::generate_context!())
        .expect("failed to run Mimorii");
}
