import crypto from "node:crypto";
import { RESTIC_PASS_FILE } from "../core/constants";

const algorithm = "aes-256-gcm" as const;
const keyLength = 32;
const encryptionPrefix = "encv1";

/**
 * Checks if a given string is encrypted by looking for the encryption prefix.
 */
const isEncrypted = (val?: string): boolean => {
	return typeof val === "string" && val.startsWith(encryptionPrefix);
};

/**
 * Given a string, encrypts it using a randomly generated salt.
 * Returns the input unchanged if it's empty or already encrypted.
 */
const encrypt = async (data: string) => {
	if (!data) {
		return data;
	}

	if (isEncrypted(data)) {
		return data;
	}

	const secret = (await Bun.file(RESTIC_PASS_FILE).text()).trim();

	const salt = crypto.randomBytes(16);
	const key = crypto.pbkdf2Sync(secret, salt, 100000, keyLength, "sha256");
	const iv = crypto.randomBytes(12);

	const cipher = crypto.createCipheriv(algorithm, key, iv);
	const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

	const tag = cipher.getAuthTag();
	return `${encryptionPrefix}:${salt.toString("hex")}:${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
};

/**
 * Given an encrypted string, decrypts it using the salt stored in the string.
 * Returns the input unchanged if it's not encrypted (for backward compatibility).
 */
const decrypt = async (encryptedData: string) => {
	if (!isEncrypted(encryptedData)) {
		return encryptedData;
	}

	const secret = await Bun.file(RESTIC_PASS_FILE).text();

	const parts = encryptedData.split(":").slice(1); // Remove prefix
	const saltHex = parts.shift() as string;
	const salt = Buffer.from(saltHex, "hex");

	const key = crypto.pbkdf2Sync(secret, salt, 100000, keyLength, "sha256");

	const iv = Buffer.from(parts.shift() as string, "hex");
	const encrypted = Buffer.from(parts.shift() as string, "hex");
	const tag = Buffer.from(parts.shift() as string, "hex");
	const decipher = crypto.createDecipheriv(algorithm, key, iv);

	decipher.setAuthTag(tag);

	let decrypted = decipher.update(encrypted);
	decrypted = Buffer.concat([decrypted, decipher.final()]);

	return decrypted.toString();
};

export const cryptoUtils = {
	encrypt,
	decrypt,
	isEncrypted,
};
