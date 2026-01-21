import path from "node:path";
import { createLogger, format, transports } from "winston";
import { sanitizeSensitiveData } from "./sanitize";
import { getZerobytePath } from "../core/platform";

const { printf, combine, colorize, timestamp } = format;

const printConsole = printf((info) => `${info.level} > ${String(info.message)}`);
const printFile = printf((info) => `${String(info.timestamp)} [${info.level.toUpperCase()}] ${String(info.message)}`);
const consoleFormat = combine(colorize(), printConsole);
const fileFormat = combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), printFile);

const getDefaultLevel = () => {
	const isProd = process.env.NODE_ENV === "production";
	return isProd ? "info" : "debug";
};

const getLogFilePath = () => {
	try {
		return path.join(getZerobytePath(), "logs", "server.log");
	} catch {
		return null;
	}
};

const createTransports = () => {
	const logTransports: (transports.ConsoleTransportInstance | transports.FileTransportInstance)[] = [
		new transports.Console({ level: process.env.LOG_LEVEL || getDefaultLevel(), format: consoleFormat }),
	];

	const logFilePath = getLogFilePath();
	if (logFilePath) {
		logTransports.push(
			new transports.File({
				filename: logFilePath,
				level: process.env.LOG_LEVEL || getDefaultLevel(),
				format: fileFormat,
				maxsize: 5 * 1024 * 1024, // 5MB
				maxFiles: 3,
				tailable: true,
			}),
		);
	}

	return logTransports;
};

const winstonLogger = createLogger({
	level: process.env.LOG_LEVEL || getDefaultLevel(),
	format: format.json(),
	transports: createTransports(),
});

const log = (level: "info" | "warn" | "error" | "debug", messages: unknown[]) => {
	const stringMessages = messages.flatMap((m) => {
		if (m instanceof Error) {
			return [sanitizeSensitiveData(m.message), m.stack ? sanitizeSensitiveData(m.stack) : undefined].filter(Boolean);
		}

		if (typeof m === "object") {
			return sanitizeSensitiveData(JSON.stringify(m, null, 2));
		}

		return sanitizeSensitiveData(String(m as string));
	});

	winstonLogger.log(level, stringMessages.join(" "));
};

export const logger = {
	debug: (...messages: unknown[]) => log("debug", messages),
	info: (...messages: unknown[]) => log("info", messages),
	warn: (...messages: unknown[]) => log("warn", messages),
	error: (...messages: unknown[]) => log("error", messages),
};
