use serde::{Deserialize, Serialize};
use std::time::Duration;
#[cfg(target_os = "windows")]
use tracing::{info, warn};

/// Internal struct for service status details
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatusInfo {
    pub installed: bool,
    pub running: bool,
    pub start_type: Option<String>,
}

/// Query the current service status string
#[cfg(target_os = "windows")]
fn query_service_status() -> String {
    use std::process::Command;

    let output = match Command::new("sc").args(["query", "ZerobyteService"]).output() {
        Ok(out) => out,
        Err(_) => return "unknown".to_string(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Check if service exists (error 1060 = service not found)
    if stderr.contains("1060") || stdout.contains("1060") {
        return "not_installed".to_string();
    }

    if stdout.contains("RUNNING") {
        "running".to_string()
    } else if stdout.contains("STOPPED") {
        "stopped".to_string()
    } else {
        "unknown".to_string()
    }
}

/// Wait for the service to reach an expected status, with polling
#[cfg(target_os = "windows")]
async fn wait_for_status(expected: &str, timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    while start.elapsed() < timeout {
        let status = query_service_status();
        if status == expected {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    false
}

/// Clean up a temporary batch file
#[cfg(target_os = "windows")]
fn cleanup_temp_file(path: &std::path::Path) {
    if let Err(e) = std::fs::remove_file(path) {
        warn!("Failed to clean up temp file {}: {}", path.display(), e);
    }
}

/// Get the current status of the Windows Service
/// Returns: "running", "stopped", "not_installed", or "unknown"
#[tauri::command]
pub async fn get_service_status() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(query_service_status())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok("not_installed".to_string())
    }
}

/// Check if the Windows Service is running by trying to connect to its port
#[tauri::command]
pub async fn is_service_running() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    match client.get("http://localhost:4097/healthcheck").send().await {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Install the Windows Service (requires elevation)
#[tauri::command]
pub async fn install_service(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::env;
        use tauri::Manager;

        // Get the path to the service executable
        let exe_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource directory: {}", e))?;

        // Try multiple possible locations for the service executable
        let possible_paths = [
            exe_dir.join("binaries").join("zerobyte-service.exe"),
            exe_dir.join("zerobyte-service.exe"),
            // Tauri may use the target triple suffix
            exe_dir.join("binaries").join("zerobyte-service-x86_64-pc-windows-msvc.exe"),
        ];

        let service_exe = possible_paths
            .iter()
            .find(|p| p.exists())
            .ok_or_else(|| {
                format!(
                    "Service executable not found. Searched: {:?}",
                    possible_paths.iter().map(|p| p.display().to_string()).collect::<Vec<_>>()
                )
            })?
            .clone();

        info!("Installing service from: {}", service_exe.display());

        // Create a batch script to install the service with elevation
        // Configure service recovery: restart on failure after 5 seconds
        let script = format!(
            r#"@echo off
sc create ZerobyteService binPath= "{}" start= auto DisplayName= "Zerobyte Backup Service"
sc description ZerobyteService "Background backup service for Zerobyte"
sc failure ZerobyteService reset= 86400 actions= restart/5000/restart/5000/restart/5000
sc start ZerobyteService
"#,
            service_exe.display()
        );

        // Write the script to a temp file
        let temp_dir = env::temp_dir();
        let script_path = temp_dir.join("zerobyte_install_service.bat");
        std::fs::write(&script_path, script)
            .map_err(|e| format!("Failed to write install script: {}", e))?;

        // Run the script with elevation using ShellExecuteW with runas verb
        run_elevated(&script_path.to_string_lossy())?;

        info!("Service installation initiated, waiting for completion...");

        // Wait for the service to be installed and running
        let success = wait_for_status("running", 15).await;

        // Clean up the temp file
        cleanup_temp_file(&script_path);

        if success {
            info!("Service installed and started successfully");
            Ok(())
        } else {
            // Check if it's at least installed but not running
            let status = query_service_status();
            if status == "stopped" {
                info!("Service installed but not running");
                Ok(())
            } else if status == "not_installed" {
                Err("Service installation failed or was cancelled".to_string())
            } else {
                Ok(()) // Service exists in some state, consider it success
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("Windows Service is only supported on Windows".to_string())
    }
}

/// Uninstall the Windows Service (requires elevation)
#[tauri::command]
pub async fn uninstall_service() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::env;

        // Create a batch script to uninstall the service with elevation
        let script = r#"@echo off
sc stop ZerobyteService
timeout /t 3 /nobreak >nul
sc delete ZerobyteService
"#;

        // Write the script to a temp file
        let temp_dir = env::temp_dir();
        let script_path = temp_dir.join("zerobyte_uninstall_service.bat");
        std::fs::write(&script_path, script)
            .map_err(|e| format!("Failed to write uninstall script: {}", e))?;

        // Run the script with elevation
        run_elevated(&script_path.to_string_lossy())?;

        info!("Service uninstallation initiated, waiting for completion...");

        // Wait for the service to be uninstalled
        let success = wait_for_status("not_installed", 15).await;

        // Clean up the temp file
        cleanup_temp_file(&script_path);

        if success {
            info!("Service uninstalled successfully");
            Ok(())
        } else {
            let status = query_service_status();
            if status == "not_installed" {
                Ok(())
            } else {
                Err("Service uninstallation failed or was cancelled".to_string())
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows Service is only supported on Windows".to_string())
    }
}

/// Start the Windows Service (requires elevation)
#[tauri::command]
pub async fn start_service() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::env;

        let script = r#"@echo off
sc start ZerobyteService
"#;

        let temp_dir = env::temp_dir();
        let script_path = temp_dir.join("zerobyte_start_service.bat");
        std::fs::write(&script_path, script)
            .map_err(|e| format!("Failed to write start script: {}", e))?;

        run_elevated(&script_path.to_string_lossy())?;

        info!("Service start initiated, waiting for completion...");

        // Wait for the service to start
        let success = wait_for_status("running", 15).await;

        // Clean up the temp file
        cleanup_temp_file(&script_path);

        if success {
            info!("Service started successfully");
            Ok(())
        } else {
            Err("Service failed to start or was cancelled".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows Service is only supported on Windows".to_string())
    }
}

/// Stop the Windows Service (requires elevation)
#[tauri::command]
pub async fn stop_service() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::env;

        let script = r#"@echo off
sc stop ZerobyteService
"#;

        let temp_dir = env::temp_dir();
        let script_path = temp_dir.join("zerobyte_stop_service.bat");
        std::fs::write(&script_path, script)
            .map_err(|e| format!("Failed to write stop script: {}", e))?;

        run_elevated(&script_path.to_string_lossy())?;

        info!("Service stop initiated, waiting for completion...");

        // Wait for the service to stop
        let success = wait_for_status("stopped", 15).await;

        // Clean up the temp file
        cleanup_temp_file(&script_path);

        if success {
            info!("Service stopped successfully");
            Ok(())
        } else {
            Err("Service failed to stop or was cancelled".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows Service is only supported on Windows".to_string())
    }
}

/// Run a command with UAC elevation using ShellExecuteW
#[cfg(target_os = "windows")]
fn run_elevated(command: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;

    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(once(0)).collect()
    }

    let operation = to_wide("runas");
    let file = to_wide("cmd.exe");
    let parameters = to_wide(&format!("/c \"{}\"", command));

    unsafe {
        let result = ShellExecuteW(
            None,
            PCWSTR(operation.as_ptr()),
            PCWSTR(file.as_ptr()),
            PCWSTR(parameters.as_ptr()),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        );

        // ShellExecuteW returns a value > 32 on success
        if result.0 as usize > 32 {
            Ok(())
        } else {
            Err(format!(
                "Failed to execute elevated command. Error code: {}",
                result.0 as usize
            ))
        }
    }
}
