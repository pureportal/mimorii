use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.mimorii.agentmobile";

#[cfg(not(target_os = "android"))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentMobileState {
    available: bool,
    enrolled: bool,
    collector_id: Option<String>,
    collector_name: Option<String>,
    server_url: Option<String>,
    collection_interval_seconds: Option<u64>,
    last_submitted_at: Option<String>,
    last_error: Option<String>,
    background_mode: &'static str,
    background_restricted: bool,
    battery_optimization_exempt: bool,
    boot_recovery_enabled: bool,
    foreground_service: bool,
    notification_permission_required: bool,
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn status() -> AgentMobileState {
    AgentMobileState {
        available: false,
        enrolled: false,
        collector_id: None,
        collector_name: None,
        server_url: None,
        collection_interval_seconds: None,
        last_submitted_at: None,
        last_error: None,
        background_mode: "inactive",
        background_restricted: false,
        battery_optimization_exempt: false,
        boot_recovery_enabled: false,
        foreground_service: false,
        notification_permission_required: false,
    }
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn enroll() -> Result<AgentMobileState, String> {
    Err("Mobile collection is available only on Android".to_owned())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn collect_now() -> Result<AgentMobileState, String> {
    Err("Mobile collection is available only on Android".to_owned())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn open_background_settings() -> Result<(), String> {
    Err("Android background settings are available only on Android".to_owned())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn unenroll() -> Result<AgentMobileState, String> {
    Err("Mobile collection is available only on Android".to_owned())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let builder = Builder::new("agent-mobile").setup(|_app, _api| {
        #[cfg(target_os = "android")]
        _api.register_android_plugin(PLUGIN_IDENTIFIER, "AgentMobilePlugin")?;
        Ok(())
    });
    #[cfg(not(target_os = "android"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        status,
        enroll,
        collect_now,
        open_background_settings,
        unenroll
    ]);
    builder.build()
}
