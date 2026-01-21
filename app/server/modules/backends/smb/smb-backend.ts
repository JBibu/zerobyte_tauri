import * as fs from "node:fs/promises";
import * as os from "node:os";
import { OPERATION_TIMEOUT } from "../../../core/constants";
import { IS_WINDOWS } from "../../../core/platform";
import { cryptoUtils } from "../../../utils/crypto";
import { toMessage } from "../../../utils/errors";
import { logger } from "../../../utils/logger";
import { getMountForPath } from "../../../utils/mountinfo";
import { withTimeout } from "../../../utils/timeout";
import type { VolumeBackend } from "../backend";
import { executeMount, executeUnmount, isPathAccessible } from "../utils/backend-utils";
import { BACKEND_STATUS, type BackendConfig } from "~/schemas/volumes";
import { exec } from "~/server/utils/spawn";

/**
 * Build a UNC path for Windows SMB access.
 * Format: \\server\share or \\server\share\path
 */
const buildUncPath = (server: string, share: string, subPath?: string): string => {
	const basePath = `\\\\${server}\\${share}`;
	if (subPath) {
		// Normalize path separators for Windows
		const normalizedSubPath = subPath.replace(/\//g, "\\").replace(/^\\+/, "");
		return `${basePath}\\${normalizedSubPath}`;
	}
	return basePath;
};

/**
 * Mount SMB share on Linux using CIFS.
 */
const mountLinux = async (config: BackendConfig, path: string) => {
	if (config.backend !== "smb") {
		return { status: BACKEND_STATUS.error, error: "Provided config is not for SMB backend" };
	}

	const { status } = await checkHealthLinux(path);
	if (status === "mounted") {
		return { status: BACKEND_STATUS.mounted };
	}

	if (status === "error") {
		logger.debug(`Trying to unmount any existing mounts at ${path} before mounting...`);
		await unmountLinux(path);
	}

	const run = async () => {
		await fs.mkdir(path, { recursive: true });

		const password = await cryptoUtils.resolveSecret(config.password);

		const source = `//${config.server}/${config.share}`;
		const { uid, gid } = os.userInfo();
		const options = [`user=${config.username}`, `pass=${password}`, `port=${config.port}`, `uid=${uid}`, `gid=${gid}`];

		if (config.vers && config.vers !== "auto") {
			options.push(`vers=${config.vers}`);
		}

		if (config.domain) {
			options.push(`domain=${config.domain}`);
		}

		if (config.readOnly) {
			options.push("ro");
		}

		const args = ["-t", "cifs", "-o", options.join(","), source, path];

		logger.debug(`Mounting SMB volume ${path}...`);
		logger.info(`Executing mount: mount ${args.join(" ")}`);

		try {
			await executeMount(args);
		} catch (error) {
			logger.warn(`Initial SMB mount failed, retrying with -i flag: ${toMessage(error)}`);
			await executeMount(["-i", ...args]);
		}

		logger.info(`SMB volume at ${path} mounted successfully.`);
		return { status: BACKEND_STATUS.mounted };
	};

	try {
		return await withTimeout(run(), OPERATION_TIMEOUT, "SMB mount");
	} catch (error) {
		logger.error("Error mounting SMB volume", { error: toMessage(error) });
		return { status: BACKEND_STATUS.error, error: toMessage(error) };
	}
};

/**
 * Unmount SMB share on Linux.
 */
const unmountLinux = async (path: string) => {
	const run = async () => {
		const mount = await getMountForPath(path);
		if (!mount || mount.mountPoint !== path) {
			logger.debug(`Path ${path} is not a mount point. Skipping unmount.`);
			return { status: BACKEND_STATUS.unmounted };
		}

		await executeUnmount(path);

		await fs.rmdir(path).catch(() => {});

		logger.info(`SMB volume at ${path} unmounted successfully.`);
		return { status: BACKEND_STATUS.unmounted };
	};

	try {
		return await withTimeout(run(), OPERATION_TIMEOUT, "SMB unmount");
	} catch (error) {
		logger.error("Error unmounting SMB volume", { path, error: toMessage(error) });
		return { status: BACKEND_STATUS.error, error: toMessage(error) };
	}
};

/**
 * Check health of SMB mount on Linux.
 */
const checkHealthLinux = async (path: string) => {
	const run = async () => {
		try {
			await fs.access(path);
		} catch {
			throw new Error("Volume is not mounted");
		}

		const mount = await getMountForPath(path);

		if (!mount || mount.mountPoint !== path) {
			throw new Error("Volume is not mounted");
		}

		if (mount.fstype !== "cifs") {
			throw new Error(`Path ${path} is not mounted as CIFS/SMB (found ${mount.fstype}).`);
		}

		logger.debug(`SMB volume at ${path} is healthy and mounted.`);
		return { status: BACKEND_STATUS.mounted };
	};

	try {
		return await withTimeout(run(), OPERATION_TIMEOUT, "SMB health check");
	} catch (error) {
		const message = toMessage(error);
		if (message !== "Volume is not mounted") {
			logger.error("SMB volume health check failed:", message);
		}
		return { status: BACKEND_STATUS.error, error: message };
	}
};

/**
 * Connect to SMB share on Windows using net use (for authenticated access).
 */
const connectWindows = async (config: BackendConfig, uncPath: string) => {
	if (config.backend !== "smb") {
		return { status: BACKEND_STATUS.error, error: "Provided config is not for SMB backend" };
	}

	const run = async () => {
		// First, check if we already have access
		if (await isPathAccessible(uncPath)) {
			logger.debug(`SMB path ${uncPath} is already accessible.`);
			return { status: BACKEND_STATUS.mounted };
		}

		// Try to establish connection using net use
		const password = await cryptoUtils.resolveSecret(config.password);
		const serverShare = `\\\\${config.server}\\${config.share}`;

		const args = ["use", serverShare];

		if (config.password) {
			args.push(password);
		}

		if (config.username) {
			const user = config.domain ? `${config.domain}\\${config.username}` : config.username;
			args.push(`/user:${user}`);
		}

		args.push("/persistent:no");

		logger.debug(`Connecting to SMB share: net use ${serverShare} ...`);
		const result = await exec({ command: "net", args, timeout: OPERATION_TIMEOUT });

		if (result.exitCode !== 0) {
			// Error code 1219 means we're already connected with different credentials
			// Error code 85 means the local device name is already in use
			if (result.stderr.includes("1219") || result.stderr.includes("85")) {
				logger.warn("SMB connection already exists, checking access...");
				if (await isPathAccessible(uncPath)) {
					return { status: BACKEND_STATUS.mounted };
				}
			}
			throw new Error(`Failed to connect to SMB share: ${result.stderr || result.stdout}`);
		}

		// Verify access after connection
		if (!(await isPathAccessible(uncPath))) {
			throw new Error(`Connected to SMB share but path ${uncPath} is not accessible`);
		}

		logger.info(`SMB share ${uncPath} connected successfully.`);
		return { status: BACKEND_STATUS.mounted };
	};

	try {
		return await withTimeout(run(), OPERATION_TIMEOUT, "SMB connect");
	} catch (error) {
		logger.error("Error connecting to SMB share", { error: toMessage(error) });
		return { status: BACKEND_STATUS.error, error: toMessage(error) };
	}
};

/**
 * Disconnect from SMB share on Windows.
 */
const disconnectWindows = async (config: BackendConfig) => {
	if (config.backend !== "smb") {
		return { status: BACKEND_STATUS.error, error: "Provided config is not for SMB backend" };
	}

	const run = async () => {
		const serverShare = `\\\\${config.server}\\${config.share}`;

		logger.debug(`Disconnecting from SMB share: net use ${serverShare} /delete`);
		const result = await exec({
			command: "net",
			args: ["use", serverShare, "/delete", "/y"],
			timeout: OPERATION_TIMEOUT,
		});

		// Error code 2250 means the connection doesn't exist
		if (result.exitCode !== 0 && !result.stderr.includes("2250")) {
			logger.warn(`Failed to disconnect from SMB share: ${result.stderr || result.stdout}`);
		}

		logger.info(`SMB share ${serverShare} disconnected.`);
		return { status: BACKEND_STATUS.unmounted };
	};

	try {
		return await withTimeout(run(), OPERATION_TIMEOUT, "SMB disconnect");
	} catch (error) {
		logger.error("Error disconnecting from SMB share", { error: toMessage(error) });
		return { status: BACKEND_STATUS.error, error: toMessage(error) };
	}
};

/**
 * Check health of SMB access on Windows.
 */
const checkHealthWindows = async (uncPath: string) => {
	const run = async () => {
		if (!(await isPathAccessible(uncPath))) {
			return { status: BACKEND_STATUS.error, error: "SMB path is not accessible" };
		}

		// Try to list the directory to verify actual access
		try {
			await fs.readdir(uncPath);
		} catch (error) {
			return { status: BACKEND_STATUS.error, error: `Cannot read SMB path: ${toMessage(error)}` };
		}

		logger.debug(`SMB path ${uncPath} is healthy and accessible.`);
		return { status: BACKEND_STATUS.mounted };
	};

	try {
		return await withTimeout(run(), OPERATION_TIMEOUT, "SMB health check");
	} catch (error) {
		const message = toMessage(error);
		logger.error("SMB health check failed:", message);
		return { status: BACKEND_STATUS.error, error: message };
	}
};

/**
 * Main mount function - routes to platform-specific implementation.
 */
const mount = async (config: BackendConfig, path: string) => {
	logger.debug(`Mounting SMB volume ${path}...`);

	if (config.backend !== "smb") {
		logger.error("Provided config is not for SMB backend");
		return { status: BACKEND_STATUS.error, error: "Provided config is not for SMB backend" };
	}

	if (IS_WINDOWS) {
		// On Windows, use UNC paths directly - the "path" is actually the UNC path
		const uncPath = buildUncPath(config.server, config.share);
		return connectWindows(config, uncPath);
	}

	return mountLinux(config, path);
};

/**
 * Main unmount function - routes to platform-specific implementation.
 */
const unmount = async (config: BackendConfig, path: string) => {
	if (config.backend !== "smb") {
		return { status: BACKEND_STATUS.error, error: "Provided config is not for SMB backend" };
	}

	if (IS_WINDOWS) {
		return disconnectWindows(config);
	}

	return unmountLinux(path);
};

/**
 * Main health check function - routes to platform-specific implementation.
 */
const checkHealth = async (config: BackendConfig, path: string) => {
	if (config.backend !== "smb") {
		return { status: BACKEND_STATUS.error, error: "Provided config is not for SMB backend" };
	}

	if (IS_WINDOWS) {
		const uncPath = buildUncPath(config.server, config.share);
		return checkHealthWindows(uncPath);
	}

	return checkHealthLinux(path);
};

/**
 * Get the effective path for SMB access.
 * On Windows, returns the UNC path. On Linux, returns the mount path.
 */
export const getSmbAccessPath = (config: BackendConfig, mountPath: string): string => {
	if (config.backend !== "smb") {
		return mountPath;
	}

	if (IS_WINDOWS) {
		return buildUncPath(config.server, config.share);
	}

	return mountPath;
};

export const makeSmbBackend = (config: BackendConfig, path: string): VolumeBackend => ({
	mount: () => mount(config, path),
	unmount: () => unmount(config, path),
	checkHealth: () => checkHealth(config, path),
});
