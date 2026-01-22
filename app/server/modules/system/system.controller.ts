import { Hono } from "hono";
import path from "node:path";
import { validator } from "hono-openapi";
import {
	downloadResticPasswordBodySchema,
	downloadResticPasswordDto,
	getLogsDto,
	getUpdatesDto,
	systemInfoDto,
	type LogsDto,
	type SystemInfoDto,
	type UpdateInfoDto,
} from "./system.dto";
import { systemService } from "./system.service";
import { requireAuth } from "../auth/auth.middleware";
import { RESTIC_PASS_FILE } from "../../core/constants";
import { db } from "../../db/db";
import { usersTable } from "../../db/schema";
import { eq } from "drizzle-orm";
import { verifyUserPassword } from "../auth/helpers";
import { getZerobytePath } from "../../core/platform";

export const systemController = new Hono()
	.use(requireAuth)
	.get("/info", systemInfoDto, async (c) => {
		const info = await systemService.getSystemInfo();

		return c.json<SystemInfoDto>(info, 200);
	})
	.get("/updates", getUpdatesDto, async (c) => {
		const updates = await systemService.getUpdates();

		return c.json<UpdateInfoDto>(updates, 200);
	})
	.get("/logs", getLogsDto, async (c) => {
		const lines = c.req.query("lines") || "200";
		const logPath = path.join(getZerobytePath(), "logs", "server.log");

		try {
			const file = Bun.file(logPath);
			const exists = await file.exists();

			if (!exists) {
				return c.json<LogsDto>({ logs: "No logs available yet.", path: logPath }, 200);
			}

			const content = await file.text();
			const allLines = content.split("\n");
			const lastLines = allLines.slice(-parseInt(lines, 10)).join("\n");

			return c.json<LogsDto>({ logs: lastLines, path: logPath }, 200);
		} catch (_error) {
			return c.json<LogsDto>({ logs: "Failed to read log file.", path: logPath }, 200);
		}
	})
	.post(
		"/restic-password",
		downloadResticPasswordDto,
		validator("json", downloadResticPasswordBodySchema),
		async (c) => {
			const user = c.get("user");
			const body = c.req.valid("json");

			const isPasswordValid = await verifyUserPassword({ password: body.password, userId: user.id });
			if (!isPasswordValid) {
				return c.json({ message: "Invalid password" }, 401);
			}

			try {
				const file = Bun.file(RESTIC_PASS_FILE);
				const content = await file.text();

				await db.update(usersTable).set({ hasDownloadedResticPassword: true }).where(eq(usersTable.id, user.id));

				c.header("Content-Type", "text/plain");
				c.header("Content-Disposition", 'attachment; filename="restic.pass"');

				return c.text(content);
			} catch (_error) {
				return c.json({ message: "Failed to read Restic password file" }, 500);
			}
		},
	);
