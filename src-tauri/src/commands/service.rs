use serde::{Deserialize, Serialize};
use std::time::Duration;
#[cfg(target_os = "windows")]
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub installed: bool,
    pub running: bool,
    pub start_type: Option<String>,
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

        let service_exe = exe_dir.join("binaries").join("zerobyte-service.exe");

        if !service_exe.exists() {
            return Err(format!(
                "Service executable not found at: {}",
                service_exe.display()
            ));
        }

        info!("Installing service from: {}", service_exe.display());

        // Create a batch script to install the service with elevation
        let script = format!(
            r#"@echo off
sc create ZerobyteService binPath= "{}" start= auto DisplayName= "C3i Backup ONE Service"
sc description ZerobyteService "Background backup service for C3i Backup ONE"
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

        info!("Service installation initiated");
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

        info!("Service uninstallation initiated");
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

        let script = r#"@echo off
sc start ZerobyteService
"#;

        let temp_dir = env::temp_dir();
        let script_path = temp_dir.join("zerobyte_start_service.bat");
        std::fs::write(&script_path, script)
            .map_err(|e| format!("Failed to write start script: {}", e))?;

        run_elevated(&script_path.to_string_lossy())?;

        info!("Service start initiated");
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

        let script = r#"@echo off
sc stop ZerobyteService
"#;

        let temp_dir = env::temp_dir();
        let script_path = temp_dir.join("zerobyte_stop_service.bat");
        std::fs::write(&script_path, script)
            .map_err(|e| format!("Failed to write stop script: {}", e))?;

        run_elevated(&script_path.to_string_lossy())?;

        info!("Service stop initiated");
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
