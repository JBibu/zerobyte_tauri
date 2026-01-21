import fs from "node:fs/promises";
import path from "node:path";
import { DATABASE_URL, VOLUME_MOUNT_BASE, REPOSITORY_BASE, RESTIC_CACHE_DIR } from "./constants";
import { getZerobytePath, IS_WINDOWS, IS_SERVICE_MODE } from "./platform";
import { logger } from "../utils/logger";
import { toMessage } from "../utils/errors";

/**
 * Check if this is the first run by checking if the database exists
 */
export async function isFirstRun(): Promise<boolean> {
	try {
		await fs.access(DATABASE_URL);
		return false;
	} catch {
		return true;
	}
}

/**
 * Ensure all required data directories exist.
 * Called on application startup.
 */
export async function ensureDataDirectories(): Promise<void> {
	const zerobytePath = getZerobytePath();

	const directories = [
		// Main data directory (contains database and restic passfile)
		path.dirname(DATABASE_URL),
		// Volume mount base
		VOLUME_MOUNT_BASE,
		// Repository base
		REPOSITORY_BASE,
		// Restic cache directory
		RESTIC_CACHE_DIR,
		// SSH keys directory
		path.join(zerobytePath, "ssh"),
		// Logs directory
		path.join(zerobytePath, "logs"),
	];

	for (const dir of directories) {
		try {
			await fs.mkdir(dir, { recursive: true });
			logger.debug(`Ensured directory exists: ${dir}`);
		} catch (error) {
			logger.warn(`Failed to create directory ${dir}: ${toMessage(error)}`);
		}
	}

	if (IS_WINDOWS) {
		logger.info(`C3i Backup ONE data directory: ${zerobytePath}`);
		if (IS_SERVICE_MODE) {
			logger.info("Running in Windows Service mode");
		}
	}
}

/**
 * Get information about the current installation
 */
export function getInstallInfo(): {
	dataPath: string;
	isWindows: boolean;
	isServiceMode: boolean;
	databasePath: string;
} {
	return {
		dataPath: getZerobytePath(),
		isWindows: IS_WINDOWS,
		isServiceMode: IS_SERVICE_MODE,
		databasePath: DATABASE_URL,
	};
}
