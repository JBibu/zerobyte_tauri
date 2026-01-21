import path from "node:path";
import { VOLUME_MOUNT_BASE } from "../../core/constants";
import { IS_WINDOWS } from "../../core/platform";
import type { Volume } from "../../db/schema";

/**
 * Normalize a directory path for the current platform.
 * On Windows, ensures paths have a drive letter if they start with just a backslash.
 */
const normalizeDirectoryPath = (dirPath: string): string => {
	if (!IS_WINDOWS) {
		return dirPath;
	}

	// Normalize the path first
	const normalized = path.normalize(dirPath);

	// If the path is just a backslash or starts with backslash without drive letter,
	// prepend the current drive (usually C:)
	if (normalized === "\\" || (normalized.startsWith("\\") && !/^[A-Za-z]:/.test(normalized))) {
		const currentDrive = process.cwd().slice(0, 2); // e.g., "C:"
		return path.join(currentDrive, normalized);
	}

	return normalized;
};

export const getVolumePath = (volume: Volume) => {
	if (volume.config.backend === "directory") {
		return normalizeDirectoryPath(volume.config.path);
	}

	return path.join(VOLUME_MOUNT_BASE, volume.shortId, "_data");
};
