import {
	betterAuth,
	type AuthContext,
	type BetterAuthOptions,
	type MiddlewareContext,
	type MiddlewareOptions,
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, twoFactor, username } from "better-auth/plugins";
import { convertLegacyUserOnFirstLogin } from "./auth-middlewares/convert-legacy-user";
import { cryptoUtils } from "~/server/utils/crypto";
import { db } from "~/server/db/db";
import { ensureOnlyOneUser } from "./auth-middlewares/only-one-user";
import { config } from "~/server/core/config";

export type AuthMiddlewareContext = MiddlewareContext<MiddlewareOptions, AuthContext<BetterAuthOptions>>;

const createBetterAuth = (secret: string) =>
	betterAuth({
		secret,
		trustedOrigins: config.trustedOrigins ?? ["*"],
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				await ensureOnlyOneUser(ctx);
				await convertLegacyUserOnFirstLogin(ctx);
			}),
		},
		database: drizzleAdapter(db, {
			provider: "sqlite",
		}),
		emailAndPassword: {
			enabled: true,
		},
		user: {
			modelName: "usersTable",
			additionalFields: {
				username: {
					type: "string",
					returned: true,
					required: true,
				},
				hasDownloadedResticPassword: {
					type: "boolean",
					returned: true,
				},
			},
		},
		session: {
			modelName: "sessionsTable",
			expiresIn: 60 * 60 * 24 * 400, // 400 days (max allowed by cookie spec)
			updateAge: 60 * 60 * 24 * 30, // Refresh session every 30 days of activity
			cookieCache: {
				enabled: true,
				maxAge: 60 * 60 * 24 * 400, // 400 days (max allowed by cookie spec)
			},
		},
		plugins: [
			username(),
			twoFactor({
				backupCodeOptions: {
					storeBackupCodes: "encrypted",
					amount: 5,
				},
			}),
		],
	});

type Auth = ReturnType<typeof createBetterAuth>;

let _auth: Auth | null = null;

const createAuth = async (): Promise<Auth> => {
	if (_auth) return _auth;

	_auth = createBetterAuth(await cryptoUtils.deriveSecret("better-auth"));

	return _auth;
};

export const auth = new Proxy(
	{},
	{
		get(_, prop, receiver) {
			if (!_auth) {
				throw new Error("Auth not initialized. Call initAuth() first.");
			}
			return Reflect.get(_auth, prop, receiver);
		},
	},
) as Auth;

export const initAuth = createAuth;
