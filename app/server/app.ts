import path from "node:path";
import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import { rateLimiter } from "hono-rate-limiter";
import { openAPIRouteHandler } from "hono-openapi";
import { authController } from "./modules/auth/auth.controller";
import { requireAuth } from "./modules/auth/auth.middleware";
import { repositoriesController } from "./modules/repositories/repositories.controller";
import { systemController } from "./modules/system/system.controller";
import { volumeController } from "./modules/volumes/volume.controller";
import { backupScheduleController } from "./modules/backups/backups.controller";
import { eventsController } from "./modules/events/events.controller";
import { notificationsController } from "./modules/notifications/notifications.controller";
import { handleServiceError } from "./utils/errors";
import { logger } from "./utils/logger";
import { config } from "./core/config";
import { auth } from "~/lib/auth";
import { closeDatabase } from "./db/db";

// Get the static files directory - use execDir for bundled binaries
const getStaticRoot = () => {
	// In production (compiled binary), use the directory containing the executable
	if (config.__prod__) {
		return path.join(path.dirname(process.execPath), "dist", "client");
	}
	// In development, use the standard dist/client or public
	return "dist/client";
};

// Flag to track if shutdown has been requested
let isShuttingDown = false;

export const generalDescriptor = (app: Hono) =>
	openAPIRouteHandler(app, {
		documentation: {
			info: {
				title: "C3i Backup ONE API",
				version: "1.0.0",
				description: "API for managing volumes",
			},
			servers: [{ url: `http://${config.serverIp}:4096`, description: "Development Server" }],
		},
	});

export const scalarDescriptor = Scalar({
	title: "C3i Backup ONE API Docs",
	pageTitle: "C3i Backup ONE API Docs",
	url: "/api/v1/openapi.json",
});

export const createApp = () => {
	const app = new Hono().use(secureHeaders());

	// Serve static files from dist/client (images, favicon, etc.)
	// This must be before other middleware to ensure static files are served
	const staticRoot = getStaticRoot();
	logger.info(`[Static] Serving static files from: ${staticRoot}`);

	app.use("/images/*", serveStatic({ root: staticRoot }));
	app.use("/assets/*", serveStatic({ root: staticRoot }));
	app.get("/site.webmanifest", serveStatic({ root: staticRoot, path: "/images/favicon/site.webmanifest" }));

	if (config.trustedOrigins) {
		app.use(cors({ origin: config.trustedOrigins }));
	}

	if (config.environment !== "test") {
		app.use(honoLogger());
	}

	if (!config.disableRateLimiting) {
		app.use(
			rateLimiter({
				windowMs: 60 * 5 * 1000,
				limit: 1000,
				keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "",
				skip: () => {
					return config.__prod__ === false;
				},
			}),
		);
	}

	app
		.get("healthcheck", (c) => c.json({ status: "ok" }))
		.post("/api/shutdown", async (c) => {
			// Graceful shutdown endpoint for Tauri/Service
			if (isShuttingDown) {
				return c.json({ message: "Shutdown already in progress" }, 200);
			}

			isShuttingDown = true;
			logger.info("Graceful shutdown requested");

			// Schedule shutdown after response is sent
			setTimeout(async () => {
				logger.info("Closing database connection...");
				closeDatabase();
				logger.info("Database closed. Exiting...");
				process.exit(0);
			}, 100);

			return c.json({ message: "Shutdown initiated" }, 200);
		})
		.route("/api/v1/auth", authController)
		.route("/api/v1/volumes", volumeController)
		.route("/api/v1/repositories", repositoriesController)
		.route("/api/v1/backups", backupScheduleController)
		.route("/api/v1/notifications", notificationsController)
		.route("/api/v1/system", systemController)
		.route("/api/v1/events", eventsController);

	app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
	app.get("/api/v1/openapi.json", generalDescriptor(app));
	app.get("/api/v1/docs", requireAuth, scalarDescriptor);

	app.onError((err, c) => {
		logger.error(`${c.req.url}: ${err.message}`);

		if (err.cause instanceof Error) {
			logger.error(err.cause.message);
		}

		const { status, message } = handleServiceError(err);

		return c.json({ message }, status);
	});

	return app;
};
