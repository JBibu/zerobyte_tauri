import { useCallback, useEffect, useState } from "react";
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

export function useNotifications() {
	const [isPermissionGranted, setIsPermissionGranted] = useState(false);
	const [isCheckingPermission, setIsCheckingPermission] = useState(true);
	const isSupported = isTauri();

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
