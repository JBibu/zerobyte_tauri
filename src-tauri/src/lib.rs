pub mod commands;

use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use tracing::{error, info, warn};

/// Holds the state of the sidecar process
pub struct AppState {
    /// The sidecar process handle (None if using service mode)
    pub sidecar_handle: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>,
    /// Whether we're connected to the Windows Service instead of sidecar
    pub using_service: Arc<Mutex<bool>>,
    /// The port the backend is running on
    pub backend_port: Arc<Mutex<u16>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            sidecar_handle: Arc::new(Mutex::new(None)),
            using_service: Arc::new(Mutex::new(false)),
            backend_port: Arc::new(Mutex::new(4096)),
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
pub async fn start_sidecar(
    app: &tauri::AppHandle,
    state: &AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // First, check if the Windows Service is running
    if is_service_running().await {
        info!("Windows Service detected on port 4097, connecting to service instead of starting sidecar");
        // Update state to reflect service mode
        *state.using_service.lock().await = true;
        *state.backend_port.lock().await = 4097;
        return Ok(());
    }

    // In dev mode only, check if the Vite dev server is already running
    #[cfg(debug_assertions)]
    if wait_for_server(4096, 30).await {
        info!("Development server already running on port 4096, skipping sidecar");
        return Ok(());
    }

    // In release mode, quick check if server is already running (e.g., from previous instance)
    #[cfg(not(debug_assertions))]
    if wait_for_server(4096, 2).await {
        info!("Server already running on port 4096, skipping sidecar");
        return Ok(());
    }

    let shell = app.shell();

    // Get the sidecar command - use just the binary name, not the path
    let sidecar_command = shell.sidecar("zerobyte-server")?;

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
    Ok(())
}

/// Stop the sidecar server process gracefully
pub async fn stop_sidecar(state: &AppState) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Don't stop anything if we're using the service
    if *state.using_service.lock().await {
        info!("Using Windows Service, not stopping sidecar");
        return Ok(());
    }

    let mut handle = state.sidecar_handle.lock().await;
    let backend_port = *state.backend_port.lock().await;

    if let Some(child) = handle.take() {
        info!("Requesting graceful shutdown...");

        // Try graceful shutdown first
        let graceful = request_graceful_shutdown(backend_port).await;

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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
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
            let state = app.state::<AppState>();

            // Clone Arcs for async block
            let sidecar_handle = state.sidecar_handle.clone();
            let using_service = state.using_service.clone();
            let backend_port = state.backend_port.clone();

            // Open devtools in debug mode only
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            // Start the sidecar and navigate to server
            tauri::async_runtime::spawn(async move {
                let _ = app_handle.emit("loading-status", "Starting sidecar...");
                info!("Starting sidecar...");

                let state_ref = AppState {
                    sidecar_handle,
                    using_service,
                    backend_port: backend_port.clone(),
                };

                if let Err(e) = start_sidecar(&app_handle, &state_ref).await {
                    let msg = format!("Failed to start sidecar: {}", e);
                    error!("{}", msg);
                    let _ = app_handle.emit("loading-status", msg);
                    return;
                }

                let _ = app_handle.emit("loading-status", "Sidecar ready, navigating...");
                info!("Sidecar ready, navigating to server...");

                // Navigate to the SSR server instead of using static assets
                if let Some(window) = app_handle.get_webview_window("main") {
                    let port = *backend_port.lock().await;
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
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();

                // Stop the sidecar when the window is closed
                let state_clone = AppState {
                    sidecar_handle: state.sidecar_handle.clone(),
                    using_service: state.using_service.clone(),
                    backend_port: state.backend_port.clone(),
                };

                tauri::async_runtime::block_on(async {
                    if let Err(e) = stop_sidecar(&state_clone).await {
                        error!("Failed to stop sidecar: {}", e);
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
