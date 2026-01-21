pub mod service;

use crate::AppState;
use std::sync::atomic::Ordering;

/// Get the URL of the backend server
/// Returns the service URL if connected to service, otherwise the sidecar URL
#[tauri::command]
pub async fn get_backend_url(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let port = state.backend_port.load(Ordering::SeqCst);
    Ok(format!("http://localhost:{}", port))
}
