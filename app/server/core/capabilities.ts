import * as fs from "node:fs/promises";
import { logger } from "../utils/logger";
import { IS_WINDOWS, IS_TAURI, getRcloneConfigPath } from "./platform";

export type SystemCapabilities = {
	rclone: boolean;
	sysAdmin: boolean;
};

let capabilitiesPromise: Promise<SystemCapabilities> | null = null;

/**
 * Returns the current system capabilities.
 * On first call, detects all capabilities and caches the promise.
 * Subsequent calls return the same cached promise, ensuring detection only happens once.
 */
export async function getCapabilities(): Promise<SystemCapabilities> {
	if (capabilitiesPromise === null) {
		capabilitiesPromise = detectCapabilities();
	}

	return capabilitiesPromise;
}

/**
 * Detects which optional capabilities are available in the current environment
 */
async function detectCapabilities(): Promise<SystemCapabilities> {
	return {
		rclone: await detectRclone(),
		sysAdmin: await detectSysAdmin(),
	};
}

/**
 * Checks if rclone is available by checking if the rclone config directory exists
 */
async function detectRclone(): Promise<boolean> {
	const rcloneConfigPath = getRcloneConfigPath();

	try {
		await fs.access(rcloneConfigPath);

		const files = await fs.readdir(rcloneConfigPath);
		if (files.length === 0) {
			throw new Error("rclone config directory is empty");
		}

		logger.info("rclone capability: enabled");
		return true;
	} catch (_) {
		if (IS_WINDOWS || IS_TAURI) {
			logger.warn(`rclone capability: disabled. To enable: create rclone config at ${rcloneConfigPath}`);
		} else {
			logger.warn("rclone capability: disabled. To enable: mount ~/.config/rclone in docker-compose.yml");
		}
		return false;
	}
}

/**
 * Detects if the process has CAP_SYS_ADMIN capability (Linux Docker only).
 * On Windows/macOS/Tauri, this capability doesn't exist - mounting is handled differently.
 */
async function detectSysAdmin(): Promise<boolean> {
	if (IS_WINDOWS) {
		logger.info("sysAdmin capability: not applicable on Windows");
		return false;
	}

	if (IS_TAURI) {
		logger.info("sysAdmin capability: not applicable in desktop app");
		return false;
	}

	if (process.platform !== "linux") {
		logger.info("sysAdmin capability: not applicable on this platform");
		return false;
	}

	try {
		const procStatus = await fs.readFile("/proc/self/status", "utf-8");
		const capEffLine = procStatus.split("\n").find((line) => line.startsWith("CapEff:"));

		if (!capEffLine) {
			logger.warn("sysAdmin capability: disabled. Could not read CapEff from /proc/self/status");
			return false;
		}

		const capEffHex = capEffLine.split(/\s+/)[1];

		if (!capEffHex) {
			logger.warn("sysAdmin capability: disabled. Could not parse CapEff value");
			return false;
		}

		const capValue = parseInt(capEffHex, 16) & (1 << 21);

		if (capValue !== 0) {
			logger.info("sysAdmin capability: enabled (CAP_SYS_ADMIN detected)");
			return true;
		}

		logger.warn("sysAdmin capability: disabled. To enable: add 'cap_add: SYS_ADMIN' in docker-compose.yml");
		return false;
	} catch (_error) {
		logger.warn("sysAdmin capability: disabled. To enable: add 'cap_add: SYS_ADMIN' in docker-compose.yml");
		return false;
	}
}
