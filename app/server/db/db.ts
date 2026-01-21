import { Database } from "bun:sqlite";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { DATABASE_URL } from "../core/constants";
import fs from "node:fs";
import { config } from "../core/config";
import type * as schemaTypes from "./schema";

/**
 * Database initialization variables
 * Lazy initialization pattern to ensure proper schema setup before database operations
 */
let _sqlite: Database | undefined;
let _db: ReturnType<typeof drizzle<typeof schemaTypes>> | undefined;
let _schema: typeof schemaTypes | undefined;

/**
 * Sets the database schema. This must be called before any database operations.
 */
export const setSchema = (schema: typeof schemaTypes) => {
	_schema = schema;
};

const initDb = () => {
	if (!_schema) {
		throw new Error("Database schema not set. Call setSchema() before accessing the database.");
	}

	fs.mkdirSync(path.dirname(DATABASE_URL), { recursive: true });

	if (fs.existsSync(path.join(path.dirname(DATABASE_URL), "ironmount.db")) && !fs.existsSync(DATABASE_URL)) {
		fs.renameSync(path.join(path.dirname(DATABASE_URL), "ironmount.db"), DATABASE_URL);
	}

	_sqlite = new Database(DATABASE_URL);
	return drizzle({ client: _sqlite, schema: _schema });
};

/**
 * Database instance (Proxy for lazy initialization)
 */
export const db = new Proxy(
	{},
	{
		get(_, prop, receiver) {
			if (!_db) {
				_db = initDb();
			}
			return Reflect.get(_db, prop, receiver);
		},
	},
) as ReturnType<typeof drizzle<typeof schemaTypes>>;

/**
 * Get the migrations folder path based on platform and environment.
 */
const getMigrationsFolder = (): string => {
	// Use custom migrations path if specified
	if (config.migrationsPath) {
		return config.migrationsPath;
	}

	// In production mode
	if (config.__prod__) {
		// Check multiple possible locations for migrations
		const possiblePaths = [
			// Tauri resource directory (cwd)
			path.join(process.cwd(), "assets", "migrations"),
			// Same directory as the executable
			path.join(path.dirname(process.execPath), "assets", "migrations"),
			// Linux Docker production path
			path.join("/app", "assets", "migrations"),
			// Development fallback
			path.join(process.cwd(), "app", "drizzle"),
		];

		for (const p of possiblePaths) {
			if (fs.existsSync(p)) {
				return p;
			}
		}

		// Fallback to the first option
		return possiblePaths[0]!;
	}

	// Development mode
	return path.join(process.cwd(), "app", "drizzle");
};

export const runDbMigrations = () => {
	const migrationsFolder = getMigrationsFolder();

	migrate(db, { migrationsFolder });

	if (!_sqlite) {
		throw new Error("Database not initialized");
	}

	_sqlite.run("PRAGMA foreign_keys = ON;");
};

/**
 * Flush WAL and checkpoint the database.
 * Useful before shutdown to ensure all data is written.
 */
export const flushDatabase = () => {
	if (_sqlite) {
		_sqlite.run("PRAGMA wal_checkpoint(TRUNCATE);");
	}
};

/**
 * Close the database connection.
 */
export const closeDatabase = () => {
	if (_sqlite) {
		flushDatabase();
		_sqlite.close();
		_sqlite = undefined;
		_db = undefined;
	}
};
