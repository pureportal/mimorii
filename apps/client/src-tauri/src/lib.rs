#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(all(feature = "client-app", feature = "mobile-agent"))]
    compile_error!("Mimorii Client and Agent features cannot be enabled together");
    let builder = tauri::Builder::default();
    #[cfg(feature = "client-app")]
    let builder = builder.plugin(tauri_plugin_push::init());
    #[cfg(feature = "mobile-agent")]
    let builder = builder.plugin(tauri_plugin_agent_mobile::init());
    builder
        .run(tauri::generate_context!())
        .expect("failed to run Mimorii");
}
