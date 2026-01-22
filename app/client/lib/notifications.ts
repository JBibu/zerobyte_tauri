/**
 * Tauri Notification Plugin Integration
 * Provides a type-safe wrapper around the Tauri notification plugin
 */

import { isTauri } from "./tauri";

/**
 * Notification permission state
 */
export type NotificationPermission = "granted" | "denied" | "default";

/**
 * Notification options
 */
export interface NotificationOptions {
	/** The notification title */
	title: string;
	/** The notification body text */
	body?: string;
	/** Notification icon (URL or path) */
	icon?: string;
	/** Notification sound */
	sound?: string;
	/** Channel ID (Android) */
	channelId?: string;
	/** Large icon (mobile) */
	largeIcon?: string;
	/** Small icon (mobile) */
	smallIcon?: string;
	/** Action type ID (mobile) */
	actionTypeId?: string;
	/** Attachments (mobile) */
	attachments?: NotificationAttachment[];
}

/**
 * Notification attachment (mobile only)
 */
export interface NotificationAttachment {
	/** Unique identifier */
	id: string;
	/** Content URL (asset:// or file:// protocol) */
	url: string;
}

/**
 * Notification channel configuration (primarily for Android)
 */
export interface NotificationChannel {
	/** Unique channel identifier */
	id: string;
	/** Display name */
	name: string;
	/** Channel description */
	description?: string;
	/** Importance level */
	importance?: NotificationImportance;
	/** Visibility setting */
	visibility?: NotificationVisibility;
	/** Enable LED lights */
	lights?: boolean;
	/** LED color (hex format) */
	lightColor?: string;
	/** Enable vibration */
	vibration?: boolean;
	/** Custom sound filename */
	sound?: string;
}

/**
 * Notification importance levels
 */
export enum NotificationImportance {
	None = 0,
	Min = 1,
	Low = 2,
	Default = 3,
	High = 4,
}

/**
 * Notification visibility settings
 */
export enum NotificationVisibility {
	Secret = -1,
	Private = 0,
	Public = 1,
}

/**
 * Action type for interactive notifications (mobile only)
 */
export interface NotificationActionType {
	/** Unique identifier */
	id: string;
	/** Available actions */
	actions: NotificationAction[];
}

/**
 * Notification action (mobile only)
 */
export interface NotificationAction {
	/** Unique identifier */
	id: string;
	/** Display text */
	title: string;
	/** Requires device authentication */
	requiresAuthentication?: boolean;
	/** Brings app to foreground */
	foreground?: boolean;
	/** Shows action in red (iOS) */
	destructive?: boolean;
	/** Enables text input */
	input?: boolean;
	/** Text for input submit button */
	inputButtonTitle?: string;
	/** Placeholder text for input */
	inputPlaceholder?: string;
}

/**
 * Get the Tauri notification API
 * @returns The notification API object or null if not in Tauri
 */
function getNotificationAPI() {
	if (!isTauri() || typeof window === "undefined") {
		return null;
	}
	return (window as any).__TAURI__?.notification;
}

/**
 * Check if notification permission is granted
 * @returns Promise<boolean> - true if permission is granted
 */
export async function isNotificationPermissionGranted(): Promise<boolean> {
	const api = getNotificationAPI();
	if (!api) {
		console.warn("Notification API not available");
		return false;
	}

	try {
		return await api.isPermissionGranted();
	} catch (error) {
		console.error("Failed to check notification permission:", error);
		return false;
	}
}

/**
 * Request notification permission
 * @returns Promise<NotificationPermission> - the permission state
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
	const api = getNotificationAPI();
	if (!api) {
		console.warn("Notification API not available");
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

/**
 * Send a notification
 * @param options - Notification options
 * @returns Promise<void>
 */
export async function sendNotification(options: NotificationOptions): Promise<void> {
	const api = getNotificationAPI();
	if (!api) {
		console.warn("Notification API not available, falling back to browser notifications");
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
		// Check and request permission if needed
		let permissionGranted = await isNotificationPermissionGranted();
		if (!permissionGranted) {
			const permission = await requestNotificationPermission();
			permissionGranted = permission === "granted";
		}

		if (permissionGranted) {
			await api.sendNotification(options);
		} else {
			console.warn("Notification permission not granted");
		}
	} catch (error) {
		console.error("Failed to send notification:", error);
		throw error;
	}
}

/**
 * Create a notification channel (Android)
 * @param channel - Channel configuration
 * @returns Promise<void>
 */
export async function createNotificationChannel(
	channel: NotificationChannel,
): Promise<void> {
	const api = getNotificationAPI();
	if (!api) {
		console.warn("Notification API not available");
		return;
	}

	try {
		await api.createChannel(channel);
	} catch (error) {
		console.error("Failed to create notification channel:", error);
		throw error;
	}
}

/**
 * List all notification channels
 * @returns Promise<NotificationChannel[]> - array of channels
 */
export async function listNotificationChannels(): Promise<NotificationChannel[]> {
	const api = getNotificationAPI();
	if (!api) {
		console.warn("Notification API not available");
		return [];
	}

	try {
		return await api.channels();
	} catch (error) {
		console.error("Failed to list notification channels:", error);
		return [];
	}
}

/**
 * Remove a notification channel
 * @param channelId - The channel ID to remove
 * @returns Promise<void>
 */
export async function removeNotificationChannel(channelId: string): Promise<void> {
	const api = getNotificationAPI();
	if (!api) {
		console.warn("Notification API not available");
		return;
	}

	try {
		await api.removeChannel(channelId);
	} catch (error) {
		console.error("Failed to remove notification channel:", error);
		throw error;
	}
}

/**
 * Register action types for interactive notifications (mobile)
 * @param actionTypes - Array of action type configurations
 * @returns Promise<void>
 */
export async function registerNotificationActionTypes(
	actionTypes: NotificationActionType[],
): Promise<void> {
	const api = getNotificationAPI();
	if (!api) {
		console.warn("Notification API not available");
		return;
	}

	try {
		await api.registerActionTypes(actionTypes);
	} catch (error) {
		console.error("Failed to register action types:", error);
		throw error;
	}
}

/**
 * Listen for notification actions (mobile)
 * @param callback - Callback function for notification actions
 * @returns Promise<() => void> - Unsubscribe function
 */
export async function onNotificationAction(
	callback: (notification: any) => void,
): Promise<() => void> {
	const api = getNotificationAPI();
	if (!api) {
		console.warn("Notification API not available");
		return () => {};
	}

	try {
		const unlisten = await api.onAction(callback);
		return unlisten;
	} catch (error) {
		console.error("Failed to listen for notification actions:", error);
		return () => {};
	}
}

/**
 * Helper function to send a simple notification
 * @param title - Notification title
 * @param body - Notification body
 * @param icon - Optional icon
 */
export async function notify(title: string, body?: string, icon?: string): Promise<void> {
	return sendNotification({ title, body, icon });
}

/**
 * Helper function to send a success notification
 * @param title - Notification title
 * @param body - Notification body
 */
export async function notifySuccess(title: string, body?: string): Promise<void> {
	return sendNotification({
		title,
		body,
		// You can add a custom success icon here if desired
	});
}

/**
 * Helper function to send an error notification
 * @param title - Notification title
 * @param body - Notification body
 */
export async function notifyError(title: string, body?: string): Promise<void> {
	return sendNotification({
		title,
		body,
		// You can add a custom error icon here if desired
	});
}

/**
 * Helper function to send a warning notification
 * @param title - Notification title
 * @param body - Notification body
 */
export async function notifyWarning(title: string, body?: string): Promise<void> {
	return sendNotification({
		title,
		body,
		// You can add a custom warning icon here if desired
	});
}

/**
 * Helper function to send an info notification
 * @param title - Notification title
 * @param body - Notification body
 */
export async function notifyInfo(title: string, body?: string): Promise<void> {
	return sendNotification({
		title,
		body,
		// You can add a custom info icon here if desired
	});
}
