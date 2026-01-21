//! C3i Backup ONE Windows Service
//!
//! This binary runs as a Windows Service and manages the zerobyte-server process.
//! It uses a separate port from desktop mode and stores data in %PROGRAMDATA%\C3i Backup ONE.
//!
//! Note: This service uses println!/eprintln! for logging as output is captured by Windows Service
//! infrastructure and written to service log files. This is intentional and appropriate for a
//! Windows Service binary.

#[cfg(windows)]
mod windows_service {
    use std::env;
    use std::ffi::OsString;
    use std::path::PathBuf;
    use std::process::{Child, Command, Stdio};
    use std::sync::mpsc::{self, Receiver};
    use std::thread;
    use std::time::Duration;

    /// Port used for Windows Service mode
    const SERVICE_PORT: u16 = 4097;

    use windows_service::service::{
        ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
        ServiceType,
    };
    use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
    use windows_service::{define_windows_service, service_dispatcher};

    const SERVICE_NAME: &str = "ZerobyteService";
    const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;

    define_windows_service!(ffi_service_main, service_main);

    pub fn run() -> Result<(), windows_service::Error> {
        // Register and start the service
        service_dispatcher::start(SERVICE_NAME, ffi_service_main)?;
        Ok(())
    }

    fn service_main(_arguments: Vec<OsString>) {
        if let Err(e) = run_service() {
            eprintln!("Service error: {:?}", e);
        }
    }

    fn run_service() -> Result<(), Box<dyn std::error::Error>> {
        // Create a channel to receive stop events
        let (shutdown_tx, shutdown_rx) = mpsc::channel();

        // Register the service control handler
        let event_handler = move |control_event| -> ServiceControlHandlerResult {
            match control_event {
                ServiceControl::Stop => {
                    let _ = shutdown_tx.send(());
                    ServiceControlHandlerResult::NoError
                }
                ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                _ => ServiceControlHandlerResult::NotImplemented,
            }
        };

        let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;

        // Report that we're starting
        status_handle.set_service_status(ServiceStatus {
            service_type: SERVICE_TYPE,
            current_state: ServiceState::StartPending,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::from_secs(10),
            process_id: None,
        })?;

        // Find the server executable
        let server_exe = find_server_executable()?;

        // Start the server process with service mode enabled
        let mut server_process = start_server_process(&server_exe)?;

        // Report that we're running
        status_handle.set_service_status(ServiceStatus {
            service_type: SERVICE_TYPE,
            current_state: ServiceState::Running,
            controls_accepted: ServiceControlAccept::STOP,
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        })?;

        // Wait for shutdown signal or server to exit
        wait_for_shutdown(shutdown_rx, &mut server_process);

        // Report that we're stopping
        status_handle.set_service_status(ServiceStatus {
            service_type: SERVICE_TYPE,
            current_state: ServiceState::StopPending,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::from_secs(10),
            process_id: None,
        })?;

        // Stop the server gracefully
        stop_server_gracefully(&mut server_process);

        // Report that we've stopped
        status_handle.set_service_status(ServiceStatus {
            service_type: SERVICE_TYPE,
            current_state: ServiceState::Stopped,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        })?;

        Ok(())
    }

    fn find_server_executable() -> Result<PathBuf, Box<dyn std::error::Error>> {
        // Look for the server executable in the same directory as this service
        let current_exe = env::current_exe()?;
        let exe_dir = current_exe.parent().ok_or("Cannot get exe directory")?;

        let server_exe = exe_dir.join("zerobyte-server.exe");
        if server_exe.exists() {
            return Ok(server_exe);
        }

        // Try the binaries subdirectory
        let server_exe = exe_dir.join("binaries").join("zerobyte-server.exe");
        if server_exe.exists() {
            return Ok(server_exe);
        }

        Err(format!(
            "Cannot find zerobyte-server.exe in {} or binaries subdirectory",
            exe_dir.display()
        )
        .into())
    }

    fn start_server_process(server_exe: &PathBuf) -> Result<Child, Box<dyn std::error::Error>> {
        // Set environment variables for service mode
        let child = Command::new(server_exe)
            .env("ZEROBYTE_SERVICE_MODE", "1")
            .env("PORT", SERVICE_PORT.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;

        // Wait for the server to be ready
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()?;

        let url = format!("http://localhost:{}/healthcheck", SERVICE_PORT);
        for attempt in 1..=30 {
            match client.get(&url).send() {
                Ok(response) if response.status().is_success() => {
                    println!("Server is ready (attempt {})", attempt);
                    return Ok(child);
                }
                _ => {
                    if attempt < 30 {
                        thread::sleep(Duration::from_millis(500));
                    }
                }
            }
        }

        Err("Server failed to start within timeout".into())
    }

    fn wait_for_shutdown(shutdown_rx: Receiver<()>, server_process: &mut Child) {
        loop {
            // Check for shutdown signal (non-blocking)
            match shutdown_rx.try_recv() {
                Ok(_) | Err(mpsc::TryRecvError::Disconnected) => {
                    println!("Shutdown signal received");
                    break;
                }
                Err(mpsc::TryRecvError::Empty) => {}
            }

            // Check if server is still running
            match server_process.try_wait() {
                Ok(Some(status)) => {
                    println!("Server process exited with status: {:?}", status);
                    break;
                }
                Ok(None) => {
                    // Server is still running, sleep and continue
                    thread::sleep(Duration::from_secs(1));
                }
                Err(e) => {
                    eprintln!("Error checking server process: {}", e);
                    break;
                }
            }
        }
    }

    fn stop_server_gracefully(server_process: &mut Child) {
        // Try to send a graceful shutdown request
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(5))
            .build();

        if let Ok(client) = client {
            let url = format!("http://localhost:{}/api/shutdown", SERVICE_PORT);
            let _ = client.post(&url).send();
            // Wait for graceful shutdown
            thread::sleep(Duration::from_secs(3));
        }

        // Check if process is still running
        match server_process.try_wait() {
            Ok(Some(_)) => {
                println!("Server stopped gracefully");
            }
            Ok(None) => {
                // Force kill if still running
                println!("Force killing server process");
                let _ = server_process.kill();
                let _ = server_process.wait();
            }
            Err(e) => {
                eprintln!("Error waiting for server: {}", e);
                let _ = server_process.kill();
            }
        }
    }
}

#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Check if running as a service or directly
    let args: Vec<String> = std::env::args().collect();

    if args.len() > 1 && args[1] == "--install" {
        // Install the service
        println!("Installing C3i Backup ONE service...");
        install_service()?;
        println!("Service installed successfully");
        return Ok(());
    }

    if args.len() > 1 && args[1] == "--uninstall" {
        // Uninstall the service
        println!("Uninstalling C3i Backup ONE service...");
        uninstall_service()?;
        println!("Service uninstalled successfully");
        return Ok(());
    }

    // Run as service
    windows_service::run().map_err(|e| e.into())
}

#[cfg(windows)]
fn install_service() -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;

    let current_exe = std::env::current_exe()?;
    let exe_path = current_exe.to_string_lossy();

    let output = Command::new("sc")
        .args([
            "create",
            "ZerobyteService",
            &format!("binPath= \"{}\"", exe_path),
            "start= auto",
            "DisplayName= C3i Backup ONE Service",
        ])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to create service: {}", stderr).into());
    }

    // Set service description
    let _ = Command::new("sc")
        .args([
            "description",
            "ZerobyteService",
            "Background backup service for C3i Backup ONE - manages scheduled backups",
        ])
        .output();

    Ok(())
}

#[cfg(windows)]
fn uninstall_service() -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;

    // Stop the service first
    let _ = Command::new("sc")
        .args(["stop", "ZerobyteService"])
        .output();

    // Wait a bit
    std::thread::sleep(std::time::Duration::from_secs(2));

    // Delete the service
    let output = Command::new("sc")
        .args(["delete", "ZerobyteService"])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete service: {}", stderr).into());
    }

    Ok(())
}

#[cfg(not(windows))]
fn main() {
    eprintln!("This binary is only supported on Windows");
    std::process::exit(1);
}
