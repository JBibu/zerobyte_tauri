/**
 * React hook for Tauri notifications
 * Provides a convenient way to use notifications in React components
 */

import { useCallback, useEffect, useState } from "react";
import type { NotificationOptions } from "../lib/notifications";
import {
	isNotificationPermissionGranted,
	notify,
	notifyError,
	notifyInfo,
	notifySuccess,
	notifyWarning,
	requestNotificationPermission,
	sendNotification,
} from "../lib/notifications";
import { isTauri } from "../lib/tauri";

/**
 * Hook return type
 */
interface UseNotificationsReturn {
	/** Whether notifications are supported */
	isSupported: boolean;
	/** Whether notification permission is granted */
	isPermissionGranted: boolean;
	/** Whether we're currently checking permission */
	isCheckingPermission: boolean;
	/** Request notification permission */
	requestPermission: () => Promise<void>;
	/** Send a notification */
	sendNotification: (options: NotificationOptions) => Promise<void>;
	/** Send a simple notification */
	notify: (title: string, body?: string) => Promise<void>;
	/** Send a success notification */
	notifySuccess: (title: string, body?: string) => Promise<void>;
	/** Send an error notification */
	notifyError: (title: string, body?: string) => Promise<void>;
	/** Send a warning notification */
	notifyWarning: (title: string, body?: string) => Promise<void>;
	/** Send an info notification */
	notifyInfo: (title: string, body?: string) => Promise<void>;
}

/**
 * React hook for using Tauri notifications
 * @returns Notification functions and state
 */
export function useNotifications(): UseNotificationsReturn {
	const [isPermissionGranted, setIsPermissionGranted] = useState(false);
	const [isCheckingPermission, setIsCheckingPermission] = useState(true);
	const isSupported = isTauri();

	// Check permission on mount
	useEffect(() => {
		if (!isSupported) {
			setIsCheckingPermission(false);
			return;
		}

		const checkPermission = async () => {
			try {
				const granted = await isNotificationPermissionGranted();
				setIsPermissionGranted(granted);
			} catch (error) {
				console.error("Failed to check notification permission:", error);
			} finally {
				setIsCheckingPermission(false);
			}
		};

		checkPermission();
	}, [isSupported]);

	const requestPermission = useCallback(async () => {
		if (!isSupported) return;

		try {
			const permission = await requestNotificationPermission();
			setIsPermissionGranted(permission === "granted");
		} catch (error) {
			console.error("Failed to request notification permission:", error);
		}
	}, [isSupported]);

	return {
		isSupported,
		isPermissionGranted,
		isCheckingPermission,
		requestPermission,
		sendNotification,
		notify,
		notifySuccess,
		notifyError,
		notifyWarning,
		notifyInfo,
	};
}
