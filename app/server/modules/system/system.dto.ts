import { type } from "arktype";
import { describeRoute, resolver } from "hono-openapi";

export const capabilitiesSchema = type({
	rclone: "boolean",
	sysAdmin: "boolean",
});

export const platformInfoSchema = type({
	os: '"windows" | "linux" | "darwin"',
	isServiceMode: "boolean",
	dataPath: "string",
});

export const systemInfoResponse = type({
	capabilities: capabilitiesSchema,
	platform: platformInfoSchema,
});

export type SystemInfoDto = typeof systemInfoResponse.infer;

export const releaseInfoSchema = type({
	version: "string",
	url: "string",
	publishedAt: "string",
	body: "string",
});

export const updateInfoResponse = type({
	currentVersion: "string",
	latestVersion: "string",
	hasUpdate: "boolean",
	missedReleases: releaseInfoSchema.array(),
});

export type UpdateInfoDto = typeof updateInfoResponse.infer;

export const systemInfoDto = describeRoute({
	description: "Get system information including available capabilities",
	tags: ["System"],
	operationId: "getSystemInfo",
	responses: {
		200: {
			description: "System information with enabled capabilities",
			content: {
				"application/json": {
					schema: resolver(systemInfoResponse),
				},
			},
		},
	},
});

export const getUpdatesDto = describeRoute({
	description: "Check for application updates from GitHub",
	tags: ["System"],
	operationId: "getUpdates",
	responses: {
		200: {
			description: "Update information and missed releases",
			content: {
				"application/json": {
					schema: resolver(updateInfoResponse),
				},
			},
		},
	},
});

export const downloadResticPasswordBodySchema = type({
	password: "string",
});

export const downloadResticPasswordDto = describeRoute({
	description: "Download the Restic password file for backup recovery. Requires password re-authentication.",
	tags: ["System"],
	operationId: "downloadResticPassword",
	responses: {
		200: {
			description: "Restic password file content",
			content: {
				"text/plain": {
					schema: { type: "string" },
				},
			},
		},
	},
});

export const logsResponseSchema = type({
	logs: "string",
	path: "string",
});

export type LogsDto = typeof logsResponseSchema.infer;

export const getLogsDto = describeRoute({
	description: "Get application logs",
	tags: ["System"],
	operationId: "getLogs",
	responses: {
		200: {
			description: "Application logs content",
			content: {
				"application/json": {
					schema: resolver(logsResponseSchema),
				},
			},
		},
	},
});
