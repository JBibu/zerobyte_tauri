use serde::{Deserialize, Serialize};
use std::time::Duration;
#[cfg(target_os = "windows")]
use tracing::info;

/// Port used for Windows Service mode
const SERVICE_PORT: u16 = 4097;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub installed: bool,
    pub running: bool,
    pub start_type: Option<String>,
}

#[cfg(target_os = "windows")]
/// Helper to create and execute an elevated batch script for service operations
async fn execute_elevated_script(
    script_name: &str,
    script_content: String,
    log_path: &std::path::Path,
    success_message: &str,
) -> Result<(), String> {
    use tokio::time::sleep;

    // Create script in temp directory
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join(script_name);

    std::fs::write(&script_path, script_content)
        .map_err(|e| format!("Failed to write {} script: {}", script_name, e))?;

    // Run the script with elevation
    run_elevated(&script_path.to_string_lossy())?;

    info!("Script {} initiated, waiting for completion...", script_name);

    // Wait for the script to complete (check for log file updates)
    for _ in 0..10 {
        sleep(Duration::from_secs(1)).await;
        if let Ok(content) = std::fs::read_to_string(log_path) {
            if content.contains(success_message) || content.contains("ERROR:") {
                break;
            }
        }
    }

    // Check for errors in log
    if let Ok(content) = std::fs::read_to_string(log_path) {
        if content.contains("ERROR:") {
            return Err(format!(
                "Operation failed. Check log file for details: {}",
                log_path.display()
            ));
        }
    }

    Ok(())
}

/// Get the current status of the Windows Service
#[tauri::command]
pub async fn get_service_status() -> Result<ServiceStatus, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        // Query service status using sc command
        let output = Command::new("sc")
            .args(["query", "ZerobyteService"])
            .output()
            .map_err(|e| format!("Failed to query service: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        // Check if service exists
        if stderr.contains("1060") || stdout.contains("1060") {
            return Ok(ServiceStatus {
                installed: false,
                running: false,
                start_type: None,
            });
        }

        let running = stdout.contains("RUNNING");

        // Query start type
        let qc_output = Command::new("sc")
            .args(["qc", "ZerobyteService"])
            .output()
            .ok();

        let start_type = qc_output.and_then(|out| {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if stdout.contains("AUTO_START") {
                Some("automatic".to_string())
            } else if stdout.contains("DEMAND_START") {
                Some("manual".to_string())
            } else if stdout.contains("DISABLED") {
                Some("disabled".to_string())
            } else {
                None
            }
        });

        Ok(ServiceStatus {
            installed: true,
            running,
            start_type,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(ServiceStatus {
            installed: false,
            running: false,
            start_type: None,
        })
    }
}

/// Check if the Windows Service is running by trying to connect to its port
#[tauri::command]
pub async fn is_service_running() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("http://localhost:{}/healthcheck", SERVICE_PORT);
    match client.get(&url).send().await {
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

        let service_exe = exe_dir.join("binaries").join("zerobyte-service.exe");

        if !service_exe.exists() {
            return Err(format!(
                "Service executable not found at: {}",
                service_exe.display()
            ));
        }

        info!("Installing service from: {}", service_exe.display());

        let temp_dir = env::temp_dir();
        let log_path = temp_dir.join("zerobyte_service_install.log");

        // Remove old log file if it exists
        let _ = std::fs::remove_file(&log_path);

        // Create batch script content
        let script = format!(
            r#"@echo off
echo Installing service... > "{log}"
sc create ZerobyteService binPath= "{exe}" start= auto DisplayName= "C3i Backup ONE Service" >> "{log}" 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Failed to create service >> "{log}"
    exit /b %errorlevel%
)
sc description ZerobyteService "Background backup service for C3i Backup ONE" >> "{log}" 2>&1
sc start ZerobyteService >> "{log}" 2>&1
echo Installation complete >> "{log}"
"#,
            exe = service_exe.display(),
            log = log_path.display()
        );

        // Execute the elevated script
        execute_elevated_script(
            "zerobyte_install_service.bat",
            script,
            &log_path,
            "Installation complete",
        )
        .await?;

        // Check the service status to verify installation
        let status = get_service_status().await?;

        if !status.installed {
            let error_details = std::fs::read_to_string(&log_path)
                .unwrap_or_else(|_| "No log file found".to_string());
            return Err(format!(
                "Service installation failed. Details:\n{}",
                error_details
            ));
        }

        info!("Service installed successfully");
        Ok(())
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

        let temp_dir = env::temp_dir();
        let log_path = temp_dir.join("zerobyte_service_uninstall.log");

        // Remove old log file if it exists
        let _ = std::fs::remove_file(&log_path);

        // Create batch script content
        let script = format!(
            r#"@echo off
echo Stopping service... > "{log}"
sc stop ZerobyteService >> "{log}" 2>&1
timeout /t 3 /nobreak >nul
echo Deleting service... >> "{log}"
sc delete ZerobyteService >> "{log}" 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Failed to delete service >> "{log}"
    exit /b %errorlevel%
)
echo Uninstallation complete >> "{log}"
"#,
            log = log_path.display()
        );

        // Execute the elevated script
        execute_elevated_script(
            "zerobyte_uninstall_service.bat",
            script,
            &log_path,
            "Uninstallation complete",
        )
        .await?;

        // Check the service status to verify uninstallation
        let status = get_service_status().await?;

        if status.installed {
            let error_details = std::fs::read_to_string(&log_path)
                .unwrap_or_else(|_| "No log file found".to_string());
            return Err(format!(
                "Service uninstallation failed. Details:\n{}",
                error_details
            ));
        }

        info!("Service uninstalled successfully");
        Ok(())
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

        let temp_dir = env::temp_dir();
        let log_path = temp_dir.join("zerobyte_service_start.log");

        // Remove old log file if it exists
        let _ = std::fs::remove_file(&log_path);

        // Create batch script content
        let script = format!(
            r#"@echo off
echo Starting service... > "{log}"
sc start ZerobyteService >> "{log}" 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Failed to start service >> "{log}"
    exit /b %errorlevel%
)
echo Service started >> "{log}"
"#,
            log = log_path.display()
        );

        // Execute the elevated script
        execute_elevated_script(
            "zerobyte_start_service.bat",
            script,
            &log_path,
            "Service started",
        )
        .await?;

        // Check if the service is running
        let status = get_service_status().await?;

        if !status.running {
            let error_details = std::fs::read_to_string(&log_path)
                .unwrap_or_else(|_| "No log file found".to_string());
            return Err(format!(
                "Failed to start service. Details:\n{}",
                error_details
            ));
        }

        info!("Service started successfully");
        Ok(())
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

        let temp_dir = env::temp_dir();
        let log_path = temp_dir.join("zerobyte_service_stop.log");

        // Remove old log file if it exists
        let _ = std::fs::remove_file(&log_path);

        // Create batch script content
        let script = format!(
            r#"@echo off
echo Stopping service... > "{log}"
sc stop ZerobyteService >> "{log}" 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Failed to stop service >> "{log}"
    exit /b %errorlevel%
)
echo Service stopped >> "{log}"
"#,
            log = log_path.display()
        );

        // Execute the elevated script
        execute_elevated_script(
            "zerobyte_stop_service.bat",
            script,
            &log_path,
            "Service stopped",
        )
        .await?;

        // Check if the service is stopped
        let status = get_service_status().await?;

        if status.running {
            let error_details = std::fs::read_to_string(&log_path)
                .unwrap_or_else(|_| "No log file found".to_string());
            return Err(format!(
                "Failed to stop service. Details:\n{}",
                error_details
            ));
        }

        info!("Service stopped successfully");
        Ok(())
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
    use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;

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
            SW_HIDE,
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
