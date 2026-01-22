import { isTauri } from "./tauri";

function getRepositoryBase(): string {
	if (!isTauri()) {
		return "/var/lib/zerobyte/repositories";
	}

	const platform = navigator.platform.toLowerCase();
	if (platform.includes("win")) {
		return "C:\\ProgramData\\Zerobyte\\repositories";
	}
	if (platform.includes("mac")) {
		return "/Library/Application Support/Zerobyte/repositories";
	}
	return "/var/lib/zerobyte/repositories";
}

export const REPOSITORY_BASE = getRepositoryBase();

export function getDefaultVolumePath(): string {
	if (!isTauri()) {
		return "/";
	}

	const platform = navigator.platform.toLowerCase();
	if (platform.includes("win")) {
		return "C:\\";
	}
	return "/";
}
