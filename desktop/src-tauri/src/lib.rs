pub mod commands;
pub mod agent_client;
pub mod settings;
pub mod tray;

use tauri::Manager;

/// Application state shared across Tauri commands.
pub struct AppState {
    pub agent_url: std::sync::Mutex<Option<String>>,
    pub agent_token: std::sync::Mutex<Option<String>>,
    pub settings: std::sync::Mutex<settings::Settings>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let settings = settings::load_settings().unwrap_or_default();
            app.manage(AppState {
                agent_url: std::sync::Mutex::new(settings.agent_url.clone()),
                agent_token: std::sync::Mutex::new(settings.agent_token.clone()),
                settings: std::sync::Mutex::new(settings),
            });

            // Setup system tray
            let _tray = tray::create_tray(app.handle())?;

            tracing::info!("Bifrost Desktop v{} started", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connect_agent,
            commands::disconnect_agent,
            commands::get_agent_info,
            commands::list_assets,
            commands::create_asset,
            commands::get_asset,
            commands::update_asset,
            commands::delete_asset,
            commands::test_asset,
            commands::list_sla_policies,
            commands::create_sla_policy,
            commands::get_sla_policy,
            commands::update_sla_policy,
            commands::delete_sla_policy,
            commands::list_jobs,
            commands::get_job,
            commands::start_job,
            commands::cancel_job,
            commands::list_backup_copies,
            commands::delete_backup_copy,
            commands::start_restore,
            commands::browse_copy,
            commands::get_health,
            commands::get_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
