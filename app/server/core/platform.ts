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
 * Detect if running inside Tauri desktop app
 * Tauri sets TAURI environment variable, or we detect via Windows/macOS in production
 */
export const IS_TAURI = Boolean(process.env.TAURI) || ((IS_WINDOWS || IS_MACOS) && process.env.NODE_ENV === "production");

/**
 * Get the application data path based on platform
 * - Windows: %APPDATA% (e.g., C:\Users\<user>\AppData\Roaming)
 * - macOS: ~/Library/Application Support
 * - Linux: /var/lib
 */
export function getAppDataPath(): string {
	if (IS_WINDOWS) {
		return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
	}
	if (IS_MACOS) {
		return path.join(os.homedir(), "Library", "Application Support");
	}
	return "/var/lib";
}

/**
 * Get the program data path (for system-wide data on Windows)
 * - Windows: %PROGRAMDATA% (e.g., C:\ProgramData)
 * - Linux/macOS: Same as getAppDataPath()
 */
export function getProgramDataPath(): string {
	if (IS_WINDOWS) {
		return process.env.PROGRAMDATA || "C:\\ProgramData";
	}
	return getAppDataPath();
}

/**
 * Get the C3i Backup ONE data directory based on platform and mode
 *
 * Can be overridden with ZEROBYTE_DATA_DIR environment variable
 *
 * Default paths:
 * - Windows (Desktop): %APPDATA%\C3i Backup ONE
 * - Windows (Service): %PROGRAMDATA%\C3i Backup ONE
 * - macOS: ~/Library/Application Support/C3i Backup ONE
 * - Linux (production/Docker): /var/lib/zerobyte
 * - Linux (development): ~/.local/share/zerobyte
 */
export function getZerobytePath(): string {
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
}

/**
 * Get the temporary directory path
 * - Windows: %TEMP%
 * - Linux/macOS: /tmp or $TMPDIR
 */
export function getTempPath(): string {
	return os.tmpdir();
}

/**
 * Get the server port based on mode
 * - Desktop mode: 4096
 * - Service mode: 4097
 */
export function getServerPort(): number {
	return IS_SERVICE_MODE ? 4097 : 4096;
}

/**
 * Get the rclone config directory based on platform
 * - Windows: %APPDATA%\rclone
 * - Linux/macOS: ~/.config/rclone (or /root/.config/rclone in Docker)
 */
export function getRcloneConfigPath(): string {
	if (IS_WINDOWS) {
		return path.join(getAppDataPath(), "rclone");
	}
	return path.join(os.homedir(), ".config", "rclone");
}

/**
 * Get SSH keys directory based on platform
 * - Windows (Desktop): %APPDATA%\C3i Backup ONE\ssh
 * - Windows (Service): %PROGRAMDATA%\C3i Backup ONE\ssh
 * - Linux/macOS: <data_path>/ssh
 */
export function getSshKeysPath(): string {
	return path.join(getZerobytePath(), "ssh");
}

/**
 * Get the path separator for the current platform
 */
export const PATH_SEPARATOR = path.sep;

/**
 * Join paths using the correct separator for the current platform
 */
export function joinPath(...paths: string[]): string {
	return path.join(...paths);
}

/**
 * Convert a path to use forward slashes (for URLs, etc.)
 */
export function toForwardSlashes(p: string): string {
	return p.replace(/\\/g, "/");
}

/**
 * Normalize a directory path for the current platform
 * On Windows, ensures paths have a drive letter if they start with just a backslash
 */
export function normalizeDirectoryPath(dirPath: string): string {
	if (!IS_WINDOWS) {
		return dirPath;
	}

	const normalized = path.normalize(dirPath);

	// If the path is just a backslash or starts with backslash without drive letter,
	// prepend the current drive (usually C:)
	if (normalized === "\\" || (normalized.startsWith("\\") && !/^[A-Za-z]:/.test(normalized))) {
		const currentDrive = process.cwd().slice(0, 2); // e.g., "C:"
		return path.join(currentDrive, normalized);
	}

	return normalized;
}

/**
 * Get binary name with platform-appropriate extension
 */
export function getBinaryName(name: string): string {
	return IS_WINDOWS ? `${name}.exe` : name;
}

/**
 * Get the default PATH environment variable with common binary locations
 * Includes the directory where the executable is located (for bundled binaries)
 */
export function getDefaultPath(): string {
	// Get the directory containing the running executable (where restic, rclone, etc. are bundled)
	const execDir = path.dirname(process.execPath);

	// In development mode, also include the src-tauri/binaries directory
	const isDev = process.env.NODE_ENV === "development";
	const devBinariesPath = isDev ? path.join(process.cwd(), "src-tauri", "binaries") : null;

	if (IS_WINDOWS) {
		const systemRoot = process.env.SystemRoot || "C:\\Windows";
		const paths = [
			execDir,
			process.cwd(),
			process.env.PATH || "",
			path.join(systemRoot, "System32"),
			systemRoot,
		];

		// Add dev binaries path if in development
		if (devBinariesPath) {
			paths.unshift(devBinariesPath);
		}

		return paths.join(path.delimiter);
	}

	const paths = [execDir, process.cwd(), process.env.PATH || "/usr/local/bin:/usr/bin:/bin"];

	// Add dev binaries path if in development
	if (devBinariesPath) {
		paths.unshift(devBinariesPath);
	}

	return paths.join(path.delimiter);
}
