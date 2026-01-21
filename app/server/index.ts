import path from "node:path";
import { createHonoServer } from "react-router-hono-server/bun";
import * as schema from "./db/schema";
import { setSchema, runDbMigrations } from "./db/db";
import { startup } from "./modules/lifecycle/startup";
import { logger } from "./utils/logger";
import { shutdown } from "./modules/lifecycle/shutdown";
import { createApp } from "./app";
import { config } from "./core/config";
import { runCLI } from "./cli";
import { runMigrations } from "./modules/lifecycle/migrations";

// Log startup paths for debugging
logger.debug(`[Startup] process.cwd(): ${process.cwd()}`);
logger.debug(`[Startup] process.execPath: ${process.execPath}`);
logger.debug(`[Startup] execDir: ${path.dirname(process.execPath)}`);

setSchema(schema);

const cliRun = await runCLI(Bun.argv);
if (cliRun) {
	process.exit(0);
}

runDbMigrations();

const app = createApp();

await runMigrations();
await startup();

export type AppType = typeof app;

process.on("SIGTERM", async () => {
	logger.info("SIGTERM received, starting graceful shutdown...");
	await shutdown();
	process.exit(0);
});

process.on("SIGINT", async () => {
	logger.info("SIGINT received, starting graceful shutdown...");
	await shutdown();
	process.exit(0);
});

export default await createHonoServer({
	app,
	port: config.port,
	customBunServer: {
		idleTimeout: config.serverIdleTimeout,
		error(err) {
			logger.error(`[Bun.serve] Server error: ${err.message}`);
		},
	},
});
