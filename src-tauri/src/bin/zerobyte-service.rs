//! Zerobyte Windows Service
//!
//! This binary runs as a Windows Service and manages the zerobyte-server process.
//! It uses port 4097 (separate from desktop's 4096) and stores data in %PROGRAMDATA%\Zerobyte.

#[cfg(windows)]
mod windows_service {
    use std::env;
    use std::ffi::OsString;
    use std::fs::{self, File, OpenOptions};
    use std::io::Write;
    use std::path::PathBuf;
    use std::process::{Child, Command, Stdio};
    use std::sync::mpsc::{self, Receiver, TryRecvError};
    use std::thread;
    use std::time::Duration;

    use windows_service::service::{
        ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
        ServiceType,
    };
    use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
    use windows_service::{define_windows_service, service_dispatcher};

    const SERVICE_NAME: &str = "ZerobyteService";
    const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;
    const MAX_RESTART_ATTEMPTS: u32 = 3;
    const RESTART_DELAY_SECS: u64 = 5;

    define_windows_service!(ffi_service_main, service_main);

    pub fn run() -> Result<(), windows_service::Error> {
        // Register and start the service
        service_dispatcher::start(SERVICE_NAME, ffi_service_main)?;
        Ok(())
    }

    fn service_main(_arguments: Vec<OsString>) {
        if let Err(e) = run_service() {
            log_error(&format!("Service error: {:?}", e));
        }
    }

    fn get_log_dir() -> PathBuf {
        // Use %PROGRAMDATA%\Zerobyte\logs for service logs
        let program_data = env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        let log_dir = PathBuf::from(program_data).join("Zerobyte").join("logs");
        let _ = fs::create_dir_all(&log_dir);
        log_dir
    }

    fn log_message(message: &str) {
        let log_dir = get_log_dir();
        let log_file = log_dir.join("service.log");

        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_file) {
            let timestamp = chrono_lite_timestamp();
            let _ = writeln!(file, "[{}] {}", timestamp, message);
        }
    }

    fn log_error(message: &str) {
        log_message(&format!("ERROR: {}", message));
    }

    fn chrono_lite_timestamp() -> String {
        // Simple timestamp without external deps
        use std::time::SystemTime;
        match SystemTime::now().duration_since(SystemTime::UNIX_EPOCH) {
            Ok(d) => format!("{}", d.as_secs()),
            Err(_) => "0".to_string(),
        }
    }

    fn run_service() -> Result<(), Box<dyn std::error::Error>> {
        log_message("Service starting...");

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
            wait_hint: Duration::from_secs(30),
            process_id: None,
        })?;

        // Find the server executable
        let server_exe = find_server_executable()?;
        log_message(&format!("Found server executable: {}", server_exe.display()));

        // Start the server process with service mode enabled
        let mut server_process = start_server_process(&server_exe)?;
        log_message("Server process started successfully");

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

        // Main service loop with crash recovery
        let mut restart_count = 0u32;
        loop {
            match wait_for_shutdown_or_crash(&shutdown_rx, &mut server_process) {
                ServerEvent::Shutdown => {
                    log_message("Shutdown signal received");
                    break;
                }
                ServerEvent::Crashed(exit_code) => {
                    log_error(&format!("Server crashed with exit code: {:?}", exit_code));

                    restart_count += 1;
                    if restart_count > MAX_RESTART_ATTEMPTS {
                        log_error(&format!(
                            "Server crashed {} times, giving up",
                            MAX_RESTART_ATTEMPTS
                        ));
                        break;
                    }

                    log_message(&format!(
                        "Attempting restart {}/{} in {} seconds...",
                        restart_count, MAX_RESTART_ATTEMPTS, RESTART_DELAY_SECS
                    ));
                    thread::sleep(Duration::from_secs(RESTART_DELAY_SECS));

                    match start_server_process(&server_exe) {
                        Ok(new_process) => {
                            server_process = new_process;
                            log_message("Server restarted successfully");
                            // Reset counter on successful restart after some uptime
                            // (we could add uptime tracking to be more sophisticated)
                        }
                        Err(e) => {
                            log_error(&format!("Failed to restart server: {}", e));
                            break;
                        }
                    }
                }
            }
        }

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
        log_message("Server stopped");

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

        log_message("Service stopped");
        Ok(())
    }

    enum ServerEvent {
        Shutdown,
        Crashed(Option<i32>),
    }

    fn find_server_executable() -> Result<PathBuf, Box<dyn std::error::Error>> {
        // Look for the server executable in the same directory as this service
        let current_exe = env::current_exe()?;
        let exe_dir = current_exe.parent().ok_or("Cannot get exe directory")?;

        // Tauri renames sidecar binaries with the target triple suffix
        // Try multiple naming conventions
        let possible_names = [
            "zerobyte-server-x86_64-pc-windows-msvc.exe", // Tauri sidecar naming
            "zerobyte-server.exe",                         // Simple naming
        ];

        // Search in current directory and parent directory (in case service is in binaries/)
        let search_dirs = [
            exe_dir.to_path_buf(),
            exe_dir.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| exe_dir.to_path_buf()),
        ];

        for dir in &search_dirs {
            for name in &possible_names {
                let server_exe = dir.join(name);
                if server_exe.exists() {
                    return Ok(server_exe);
                }
                // Also check binaries subdirectory
                let server_exe = dir.join("binaries").join(name);
                if server_exe.exists() {
                    return Ok(server_exe);
                }
            }
        }

        Err(format!(
            "Cannot find zerobyte-server.exe in {} or parent directories. Searched for: {:?}",
            exe_dir.display(),
            possible_names
        )
        .into())
    }

    fn start_server_process(server_exe: &PathBuf) -> Result<Child, Box<dyn std::error::Error>> {
        let log_dir = get_log_dir();

        // Create log files for server output
        let stdout_log = log_dir.join("server-stdout.log");
        let stderr_log = log_dir.join("server-stderr.log");

        let stdout_file = File::create(&stdout_log)
            .map_err(|e| format!("Failed to create stdout log: {}", e))?;
        let stderr_file = File::create(&stderr_log)
            .map_err(|e| format!("Failed to create stderr log: {}", e))?;

        log_message(&format!("Server stdout log: {}", stdout_log.display()));
        log_message(&format!("Server stderr log: {}", stderr_log.display()));

        // Set environment variables for service mode
        let child = Command::new(server_exe)
            .env("ZEROBYTE_SERVICE_MODE", "1")
            .env("PORT", "4097")
            .stdout(Stdio::from(stdout_file))
            .stderr(Stdio::from(stderr_file))
            .spawn()?;

        // Wait for the server to be ready
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()?;

        for attempt in 1..=30 {
            match client.get("http://localhost:4097/healthcheck").send() {
                Ok(response) if response.status().is_success() => {
                    log_message(&format!("Server is ready (attempt {})", attempt));
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

    fn wait_for_shutdown_or_crash(
        shutdown_rx: &Receiver<()>,
        server_process: &mut Child,
    ) -> ServerEvent {
        loop {
            // Check for shutdown signal (non-blocking)
            match shutdown_rx.try_recv() {
                Ok(_) | Err(TryRecvError::Disconnected) => {
                    return ServerEvent::Shutdown;
                }
                Err(TryRecvError::Empty) => {}
            }

            // Check if server is still running
            match server_process.try_wait() {
                Ok(Some(status)) => {
                    return ServerEvent::Crashed(status.code());
                }
                Ok(None) => {
                    // Server is still running, sleep and continue
                    thread::sleep(Duration::from_secs(1));
                }
                Err(e) => {
                    log_error(&format!("Error checking server process: {}", e));
                    return ServerEvent::Crashed(None);
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
            log_message("Sending graceful shutdown request...");
            match client.post("http://localhost:4097/api/shutdown").send() {
                Ok(_) => log_message("Shutdown request sent"),
                Err(e) => log_message(&format!("Shutdown request failed: {}", e)),
            }
            // Wait for graceful shutdown
            thread::sleep(Duration::from_secs(3));
        }

        // Check if process is still running
        match server_process.try_wait() {
            Ok(Some(_)) => {
                log_message("Server stopped gracefully");
            }
            Ok(None) => {
                // Force kill if still running
                log_message("Force killing server process");
                let _ = server_process.kill();
                let _ = server_process.wait();
            }
            Err(e) => {
                log_error(&format!("Error waiting for server: {}", e));
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
        println!("Installing Zerobyte service...");
        install_service()?;
        println!("Service installed successfully");
        return Ok(());
    }

    if args.len() > 1 && args[1] == "--uninstall" {
        // Uninstall the service
        println!("Uninstalling Zerobyte service...");
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
            "DisplayName= Zerobyte Backup Service",
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
            "Background backup service for Zerobyte - manages scheduled backups",
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
