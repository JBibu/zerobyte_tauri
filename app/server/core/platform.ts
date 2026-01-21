import os from "node:os";
import path from "node:path";

/**
 * Platform detection constants
 */
export const IS_WINDOWS = process.platform === "win32";
export const IS_LINUX = process.platform === "linux";
export const IS_MACOS = process.platform === "darwin";
export const EXE_SUFFIX = IS_WINDOWS ? ".exe" : "";

/**
 * Detect if running as Windows Service
 * Set ZEROBYTE_SERVICE_MODE=1 when running as a Windows Service
 */
export const IS_SERVICE_MODE = process.env.ZEROBYTE_SERVICE_MODE === "1";

/**
 * Get the application data path based on platform
 * - Windows: %APPDATA% (C:\Users\<user>\AppData\Roaming)
 * - Linux: /var/lib
 * - macOS: ~/Library/Application Support
 */
export const getAppDataPath = (): string => {
	if (IS_WINDOWS) {
		return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
	}
	if (IS_MACOS) {
		return path.join(os.homedir(), "Library", "Application Support");
	}
	return "/var/lib";
};

/**
 * Get the program data path (for system-wide data on Windows)
 * - Windows: %PROGRAMDATA% (C:\ProgramData)
 * - Linux/macOS: Same as getAppDataPath()
 */
export const getProgramDataPath = (): string => {
	if (IS_WINDOWS) {
		return process.env.PROGRAMDATA || "C:\\ProgramData";
	}
	return getAppDataPath();
};

/**
 * Get the Zerobyte data directory based on platform and mode
 * - Can be overridden with ZEROBYTE_DATA_DIR environment variable
 * - Desktop mode (Windows): %APPDATA%\Zerobyte
 * - Service mode (Windows): %PROGRAMDATA%\Zerobyte
 * - Linux (production/Docker): /var/lib/zerobyte
 * - Linux (development): ~/.local/share/zerobyte
 * - macOS: ~/Library/Application Support/Zerobyte
 */
export const getZerobytePath = (): string => {
	// Allow override via environment variable
	if (process.env.ZEROBYTE_DATA_DIR) {
		return process.env.ZEROBYTE_DATA_DIR;
	}

	if (IS_WINDOWS) {
		if (IS_SERVICE_MODE) {
			return path.join(getProgramDataPath(), "C3i Backup ONE");
		}
		return path.join(getAppDataPath(), "C3i Backup ONE");
	}
	if (IS_MACOS) {
		return path.join(getAppDataPath(), "C3i Backup ONE");
	}

	// Linux: Use /var/lib/zerobyte in production (Docker), otherwise use user directory
	const isProduction = process.env.NODE_ENV === "production";
	if (isProduction) {
		return "/var/lib/zerobyte";
	}

	// Development mode: use user-accessible directory
	return path.join(os.homedir(), ".local", "share", "zerobyte");
};

/**
 * Get the temporary directory path
 * - Windows: %TEMP%
 * - Linux/macOS: /tmp or $TMPDIR
 */
export const getTempPath = (): string => {
	return os.tmpdir();
};

/**
 * Get the server port based on mode
 * - Desktop mode: 4096
 * - Service mode: 4097
 */
export const getServerPort = (): number => {
	if (IS_SERVICE_MODE) {
		return 4097;
	}
	return 4096;
};

/**
 * Get the rclone config directory based on platform
 * - Windows: %APPDATA%\rclone
 * - Linux: /root/.config/rclone (or ~/.config/rclone)
 * - macOS: ~/.config/rclone
 */
export const getRcloneConfigPath = (): string => {
	if (IS_WINDOWS) {
		return path.join(getAppDataPath(), "rclone");
	}
	// For Docker/Linux, we use /root/.config/rclone
	// For non-root users, use ~/.config/rclone
	const homeDir = os.homedir();
	return path.join(homeDir, ".config", "rclone");
};

/**
 * Get SSH keys directory based on platform
 * - Windows (Desktop): %APPDATA%\Zerobyte\ssh
 * - Windows (Service): %PROGRAMDATA%\Zerobyte\ssh
 * - Linux: /var/lib/zerobyte/ssh
 */
export const getSshKeysPath = (): string => {
	return path.join(getZerobytePath(), "ssh");
};

/**
 * Get the path separator for the current platform
 */
export const PATH_SEPARATOR = path.sep;

/**
 * Join paths using the correct separator for the current platform
 */
export const joinPath = (...paths: string[]): string => {
	return path.join(...paths);
};

/**
 * Convert a path to use forward slashes (for URLs, etc.)
 */
export const toForwardSlashes = (p: string): string => {
	return p.replace(/\\/g, "/");
};

/**
 * Get binary name with platform-appropriate extension
 */
export const getBinaryName = (name: string): string => {
	return IS_WINDOWS ? `${name}.exe` : name;
};

/**
 * Get the default PATH environment variable with common binary locations
 */
export const getDefaultPath = (): string => {
	if (IS_WINDOWS) {
		const systemRoot = process.env.SystemRoot || "C:\\Windows";
		return [
			process.env.PATH || "",
			path.join(systemRoot, "System32"),
			systemRoot,
		].join(path.delimiter);
	}
	return process.env.PATH || "/usr/local/bin:/usr/bin:/bin";
};
