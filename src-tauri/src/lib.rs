pub mod commands;

use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use tracing::{error, info, warn};

/// Holds the state of the sidecar process
pub struct AppState {
    /// The sidecar process handle (None if using service mode)
    pub sidecar_handle: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>,
    /// Whether we're connected to the Windows Service instead of sidecar
    pub using_service: AtomicBool,
    /// The port the backend is running on
    pub backend_port: AtomicU16,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            sidecar_handle: Arc::new(Mutex::new(None)),
            using_service: AtomicBool::new(false),
            backend_port: AtomicU16::new(4096),
        }
    }
}

/// Check if the Windows Service is running by trying to connect to port 4097
async fn is_service_running() -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    match client.get("http://localhost:4097/healthcheck").send().await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

/// Check if the sidecar server is ready by checking the healthcheck endpoint
async fn wait_for_server(port: u16, max_attempts: u32) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    let url = format!("http://localhost:{}/healthcheck", port);

    for attempt in 1..=max_attempts {
        match client.get(&url).send().await {
            Ok(response) if response.status().is_success() => {
                info!("Server is ready on port {} (attempt {})", port, attempt);
                return true;
            }
            Ok(response) => {
                warn!(
                    "Server returned status {} on attempt {}",
                    response.status(),
                    attempt
                );
            }
            Err(e) => {
                if attempt < max_attempts {
                    info!("Waiting for server (attempt {}): {}", attempt, e);
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    error!("Server failed to start after {} attempts", max_attempts);
    false
}

/// Request graceful shutdown of the server
async fn request_graceful_shutdown(port: u16) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    let url = format!("http://localhost:{}/api/shutdown", port);

    match client.post(&url).send().await {
        Ok(response) => {
            info!("Shutdown request sent, status: {}", response.status());
            response.status().is_success()
        }
        Err(e) => {
            warn!("Failed to send shutdown request: {}", e);
            false
        }
    }
}

/// Start the sidecar server process
/// Returns the port that the backend is running on
pub async fn start_sidecar(
    app: &tauri::AppHandle,
    state: &AppState,
) -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    // First, check if the Windows Service is running
    if is_service_running().await {
        info!("Windows Service detected on port 4097, connecting to service instead of starting sidecar");
        state.using_service.store(true, Ordering::SeqCst);
        state.backend_port.store(4097, Ordering::SeqCst);
        return Ok(4097);
    }

    // In dev mode only, check if the Vite dev server is already running
    #[cfg(debug_assertions)]
    if wait_for_server(4096, 30).await {
        info!("Development server already running on port 4096, skipping sidecar");
        return Ok(4096);
    }

    // In release mode, quick check if server is already running (e.g., from previous instance)
    #[cfg(not(debug_assertions))]
    if wait_for_server(4096, 2).await {
        info!("Server already running on port 4096, skipping sidecar");
        return Ok(4096);
    }

    let shell = app.shell();

    // Get the resource directory where Tauri bundles our static files
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource directory: {}", e))?;

    info!("Resource directory: {}", resource_dir.display());

    // Get the sidecar command and set the working directory to resource_dir
    // This ensures the server can find dist/client for static files
    let sidecar_command = shell
        .sidecar("zerobyte-server")?
        .current_dir(resource_dir);

    info!("Starting zerobyte-server sidecar on port 4096...");

    // Spawn the sidecar process
    let (mut rx, child) = sidecar_command.spawn()?;

    // Store the child handle
    {
        let mut handle = state.sidecar_handle.lock().await;
        *handle = Some(child);
    }

    // Spawn a task to handle sidecar output
    let app_handle = app.clone();
    tokio::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    info!("[sidecar stdout] {}", line_str);
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    warn!("[sidecar stderr] {}", line_str);
                }
                CommandEvent::Error(err) => {
                    error!("[sidecar error] {}", err);
                }
                CommandEvent::Terminated(payload) => {
                    info!(
                        "[sidecar] Process terminated with code: {:?}",
                        payload.code
                    );
                    // Optionally emit an event to the frontend
                    let _ = app_handle.emit("sidecar-terminated", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    // Wait for the server to be ready
    if !wait_for_server(4096, 30).await {
        return Err("Failed to start zerobyte-server".into());
    }

    info!("Sidecar server started successfully");
    Ok(4096)
}

/// Stop the sidecar server process gracefully
pub async fn stop_sidecar(state: &AppState) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Don't stop anything if we're using the service
    if state.using_service.load(Ordering::SeqCst) {
        info!("Using Windows Service, not stopping sidecar");
        return Ok(());
    }

    let mut handle = state.sidecar_handle.lock().await;

    if let Some(child) = handle.take() {
        info!("Requesting graceful shutdown...");

        // Try graceful shutdown first
        let graceful = request_graceful_shutdown(state.backend_port.load(Ordering::SeqCst)).await;

        if graceful {
            // Wait a bit for graceful shutdown
            tokio::time::sleep(Duration::from_secs(2)).await;
        }

        // Kill the process if still running
        info!("Terminating sidecar process...");
        let _ = child.kill();

        info!("Sidecar stopped");
    } else {
        info!("No sidecar process to stop");
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("zerobyte=info".parse().unwrap())
                .add_directive("tauri=info".parse().unwrap()),
        )
        .init();

    tauri::Builder::default()
        // Single instance plugin must be registered first
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the main window when a new instance tries to start
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_backend_url,
            commands::service::get_service_status,
            commands::service::install_service,
            commands::service::uninstall_service,
            commands::service::start_service,
            commands::service::stop_service,
            commands::service::is_service_running,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Open devtools in debug mode only
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            // Create system tray menu
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let separator1 = MenuItem::with_id(app, "sep1", "────────────", false, None::<&str>)?;
            let volumes = MenuItem::with_id(app, "volumes", "Volumes", true, None::<&str>)?;
            let repositories = MenuItem::with_id(app, "repositories", "Repositories", true, None::<&str>)?;
            let backups = MenuItem::with_id(app, "backups", "Backups", true, None::<&str>)?;
            let notifications = MenuItem::with_id(app, "notifications", "Notifications", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let separator2 = MenuItem::with_id(app, "sep2", "────────────", false, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &show,
                    &separator1,
                    &volumes,
                    &repositories,
                    &backups,
                    &notifications,
                    &settings,
                    &separator2,
                    &quit,
                ],
            )?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("C3i Backup ONE")
                .on_menu_event(|app, event| {
                    let window = app.get_webview_window("main");
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = window {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "volumes" | "repositories" | "backups" | "notifications" | "settings" => {
                            if let Some(window) = window {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let state = app.state::<AppState>();
                                let port = state.backend_port.load(Ordering::SeqCst);
                                let url = format!("http://localhost:{}/{}", port, event.id.as_ref());
                                let _ = window.navigate(url.parse().unwrap());
                            }
                        }
                        "quit" => {
                            let state = app.state::<AppState>();
                            tauri::async_runtime::block_on(async {
                                if let Err(e) = stop_sidecar(&state).await {
                                    error!("Failed to stop sidecar: {}", e);
                                }
                            });
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Start the sidecar and navigate to server
            tauri::async_runtime::spawn(async move {
                let _ = app_handle.emit("loading-status", "Starting backend...");
                info!("Starting backend...");

                let state = app_handle.state::<AppState>();
                let port = match start_sidecar(&app_handle, &state).await {
                    Ok(port) => port,
                    Err(e) => {
                        let msg = format!("Failed to start backend: {}", e);
                        error!("{}", msg);
                        let _ = app_handle.emit("loading-status", msg);
                        return;
                    }
                };

                let _ = app_handle.emit("loading-status", "Backend ready, navigating...");
                info!("Backend ready on port {}, navigating to server...", port);

                // Navigate to the SSR server instead of using static assets
                if let Some(window) = app_handle.get_webview_window("main") {
                    let url = format!("http://localhost:{}/", port);
                    info!("Navigating to SSR server at {}", url);
                    if let Err(e) = window.navigate(url.parse().unwrap()) {
                        let msg = format!("Failed to navigate: {}", e);
                        error!("{}", msg);
                        let _ = app_handle.emit("loading-status", msg);
                    }
                } else {
                    error!("Could not get main window");
                    let _ = app_handle.emit("loading-status", "Error: Could not get main window");
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Minimize to tray instead of quitting
                api.prevent_close();
                let _ = window.hide();
                info!("Window minimized to tray");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
