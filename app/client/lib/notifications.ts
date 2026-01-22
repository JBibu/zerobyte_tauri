/**
 * Tauri Notification Plugin Integration
 */

import { isTauri } from "./tauri";

export type NotificationPermission = "granted" | "denied" | "default";

export interface NotificationOptions {
	title: string;
	body?: string;
	icon?: string;
	sound?: string;
}

function getNotificationAPI() {
	if (!isTauri() || typeof window === "undefined") {
		return null;
	}
	return (window as any).__TAURI__?.notification;
}

export async function isNotificationPermissionGranted(): Promise<boolean> {
	const api = getNotificationAPI();
	if (!api) {
		return false;
	}

	try {
		return await api.isPermissionGranted();
	} catch (error) {
		console.error("Failed to check notification permission:", error);
		return false;
	}
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
	const api = getNotificationAPI();
	if (!api) {
		return "denied";
	}

	try {
		const permission = await api.requestPermission();
		return permission as NotificationPermission;
	} catch (error) {
		console.error("Failed to request notification permission:", error);
		return "denied";
	}
}

export async function sendNotification(options: NotificationOptions): Promise<void> {
	const api = getNotificationAPI();
	if (!api) {
		// Fallback to browser notifications if not in Tauri
		if (typeof window !== "undefined" && "Notification" in window) {
			if (Notification.permission === "granted") {
				new Notification(options.title, {
					body: options.body,
					icon: options.icon,
				});
			}
		}
		return;
	}

	try {
		let permissionGranted = await isNotificationPermissionGranted();
		if (!permissionGranted) {
			const permission = await requestNotificationPermission();
			permissionGranted = permission === "granted";
		}

		if (permissionGranted) {
			await api.sendNotification(options);
		}
	} catch (error) {
		console.error("Failed to send notification:", error);
		throw error;
	}
}

export async function notify(title: string, body?: string): Promise<void> {
	return sendNotification({ title, body });
}

export const notifySuccess = notify;
export const notifyError = notify;
export const notifyWarning = notify;
export const notifyInfo = notify;
