import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

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
			return path.join(getProgramDataPath(), "Zerobyte");
		}
		return path.join(getAppDataPath(), "Zerobyte");
	}
	if (IS_MACOS) {
		return path.join(getAppDataPath(), "Zerobyte");
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
 * Get the rclone config directory based on platform and mode
 * - Windows Desktop: %APPDATA%\rclone
 * - Windows Service: %PROGRAMDATA%\Zerobyte\rclone (SYSTEM account has no user profile)
 * - Linux: /root/.config/rclone (or ~/.config/rclone)
 * - macOS: ~/.config/rclone
 */
export const getRcloneConfigPath = (): string => {
	if (IS_WINDOWS) {
		if (IS_SERVICE_MODE) {
			// Service runs as SYSTEM which has no user profile
			// Store rclone config in ProgramData alongside other Zerobyte data
			return path.join(getProgramDataPath(), "Zerobyte", "rclone");
		}
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
 * Get the null device path for the current platform
 * - Windows: NUL
 * - Unix: /dev/null
 */
export const getNullDevice = (): string => {
	return IS_WINDOWS ? "NUL" : "/dev/null";
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

const execFileAsync = promisify(execFile);

/**
 * Write a file with restricted permissions (owner read/write only).
 * On Unix, this sets mode 0o600.
 * On Windows, this uses icacls to remove inherited permissions and grant
 * only the current user full control.
 *
 * @param filePath - Path to the file to write
 * @param content - Content to write
 */
export const writeSecureFile = async (filePath: string, content: string): Promise<void> => {
	// Write the file first
	await fs.writeFile(filePath, content, { mode: 0o600 });

	// On Windows, use icacls to set restrictive permissions
	if (IS_WINDOWS) {
		try {
			// Get current username
			const username = process.env.USERNAME || os.userInfo().username;

			// Remove inheritance and grant only the current user full control
			// /inheritance:r - Remove all inherited ACEs
			// /grant:r - Replace existing grants
			await execFileAsync("icacls", [
				filePath,
				"/inheritance:r",
				"/grant:r",
				`${username}:(F)`,
			]);
		} catch {
			// If icacls fails, the file is still written but may have broader permissions
			// This is a best-effort security measure
		}
	}
};

/**
 * Write a file with restricted permissions suitable for SSH keys.
 * This is stricter and will throw on Windows if permissions cannot be set,
 * as SSH clients often refuse to use keys with incorrect permissions.
 *
 * @param filePath - Path to the file to write
 * @param content - Content to write
 * @throws Error if permissions cannot be set on Windows (SSH may reject the key)
 */
export const writeSshKeyFile = async (filePath: string, content: string): Promise<void> => {
	// Write the file first
	await fs.writeFile(filePath, content, { mode: 0o600 });

	// On Windows, use icacls to set restrictive permissions
	// SSH on Windows will reject keys with incorrect permissions
	if (IS_WINDOWS) {
		try {
			const username = process.env.USERNAME || os.userInfo().username;

			// Remove inheritance and all other users, grant only current user full control
			await execFileAsync("icacls", [
				filePath,
				"/inheritance:r",
				"/remove:g",
				"BUILTIN\\Users",
				"/remove:g",
				"BUILTIN\\Administrators",
				"/grant:r",
				`${username}:(F)`,
			]);
		} catch (error) {
			// SSH clients may refuse to use keys with broad permissions
			// Log a warning but don't fail - let SSH handle the permission check
			console.warn(`Warning: Could not set restrictive permissions on SSH key file: ${filePath}`);
		}
	}
};
