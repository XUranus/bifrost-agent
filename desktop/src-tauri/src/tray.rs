use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

pub fn create_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let nav_assets = MenuItem::with_id(app, "nav:assets", "Assets", true, None::<&str>)?;
    let nav_jobs = MenuItem::with_id(app, "nav:jobs", "Jobs", true, None::<&str>)?;
    let nav_sla = MenuItem::with_id(app, "nav:sla", "SLA Policies", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[
        &show,
        &separator1,
        &nav_assets,
        &nav_jobs,
        &nav_sla,
        &separator2,
        &quit,
    ])?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Bifrost Desktop")
        .on_menu_event(|app: &tauri::AppHandle, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "nav:assets" | "nav:jobs" | "nav:sla" => {
                let path = match event.id.as_ref() {
                    "nav:assets" => "/assets",
                    "nav:jobs" => "/jobs",
                    "nav:sla" => "/sla-policies",
                    _ => "/",
                };
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("tray:navigate", path);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
