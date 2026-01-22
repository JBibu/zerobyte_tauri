/**
 * Example component demonstrating Tauri notification usage
 * This file serves as documentation and can be adapted for actual use
 */

import { useNotifications } from "../app/client/hooks/use-notifications";

/**
 * Example: Basic notification component
 */
export function NotificationExample() {
	const {
		isSupported,
		isPermissionGranted,
		isCheckingPermission,
		requestPermission,
		notify,
		notifySuccess,
		notifyError,
		notifyWarning,
		notifyInfo,
	} = useNotifications();

	// Show loading state while checking permission
	if (isCheckingPermission) {
		return <div>Checking notification permissions...</div>;
	}

	// Show message if notifications are not supported
	if (!isSupported) {
		return (
			<div className="alert alert-warning">
				Notifications are only available in the Tauri desktop app.
			</div>
		);
	}

	// Request permission if not granted
	if (!isPermissionGranted) {
		return (
			<div className="space-y-4">
				<p>Notification permission is required to receive alerts.</p>
				<button
					onClick={requestPermission}
					className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
				>
					Enable Notifications
				</button>
			</div>
		);
	}

	// Show notification examples
	return (
		<div className="space-y-4">
			<h2 className="text-xl font-bold">Notification Examples</h2>

			<div className="space-y-2">
				<button
					onClick={() => notify("Simple Notification", "This is a basic notification")}
					className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
				>
					Send Simple Notification
				</button>

				<button
					onClick={() => notifySuccess("Backup Complete", "Your data has been backed up successfully")}
					className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
				>
					Send Success Notification
				</button>

				<button
					onClick={() => notifyError("Backup Failed", "Failed to complete backup. Please check your configuration.")}
					className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
				>
					Send Error Notification
				</button>

				<button
					onClick={() => notifyWarning("Low Disk Space", "Your backup storage is running low on space.")}
					className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
				>
					Send Warning Notification
				</button>

				<button
					onClick={() => notifyInfo("Backup Scheduled", "Your next backup is scheduled for tomorrow at 2:00 AM")}
					className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
				>
					Send Info Notification
				</button>
			</div>
		</div>
	);
}

/**
 * Example: Integration with backup operations
 */
export function BackupNotificationExample() {
	const { notifySuccess, notifyError, notifyInfo, notifyWarning } = useNotifications();

	// Example: Notify on backup completion
	const handleBackupComplete = async (backupName: string) => {
		await notifySuccess(
			"Backup Complete",
			`${backupName} has been backed up successfully`,
		);
	};

	// Example: Notify on backup failure
	const handleBackupError = async (backupName: string, error: string) => {
		await notifyError(
			"Backup Failed",
			`Failed to backup ${backupName}: ${error}`,
		);
	};

	// Example: Notify when backup starts
	const handleBackupStart = async (backupName: string) => {
		await notifyInfo(
			"Backup Started",
			`Starting backup of ${backupName}...`,
		);
	};

	// Example: Notify on low disk space
	const handleLowDiskSpace = async (availableSpace: string) => {
		await notifyWarning(
			"Low Disk Space",
			`Only ${availableSpace} remaining in backup storage`,
		);
	};

	return (
		<div className="space-y-4">
			<h2 className="text-xl font-bold">Backup Notification Integration</h2>
			<p>This example shows how to integrate notifications with backup operations.</p>

			<div className="space-y-2">
				<button
					onClick={() => handleBackupStart("My Important Files")}
					className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
				>
					Simulate Backup Start
				</button>

				<button
					onClick={() => handleBackupComplete("My Important Files")}
					className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
				>
					Simulate Backup Success
				</button>

				<button
					onClick={() => handleBackupError("My Important Files", "Network timeout")}
					className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
				>
					Simulate Backup Error
				</button>

				<button
					onClick={() => handleLowDiskSpace("2.5 GB")}
					className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
				>
					Simulate Low Disk Space Warning
				</button>
			</div>
		</div>
	);
}

/**
 * Example: Using notifications with custom options
 */
export function AdvancedNotificationExample() {
	const { sendNotification } = useNotifications();

	const sendCustomNotification = async () => {
		await sendNotification({
			title: "Custom Notification",
			body: "This notification has custom options",
			// You can add custom icons here
			// icon: "path/to/icon.png",
			// sound: "notification_sound",
		});
	};

	return (
		<div className="space-y-4">
			<h2 className="text-xl font-bold">Advanced Notification Example</h2>

			<button
				onClick={sendCustomNotification}
				className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
			>
				Send Custom Notification
			</button>
		</div>
	);
}

/**
 * Example: Real-world usage in a backup component
 */
export function BackupComponent() {
	const { notifySuccess, notifyError, notifyInfo } = useNotifications();

	const performBackup = async () => {
		try {
			// Notify user that backup is starting
			await notifyInfo("Backup Started", "Preparing to backup your files...");

			// Simulate backup operation
			await new Promise(resolve => setTimeout(resolve, 3000));

			// Simulate random success/failure
			const success = Math.random() > 0.3;

			if (success) {
				await notifySuccess(
					"Backup Complete",
					"All files have been backed up successfully",
				);
			} else {
				throw new Error("Network connection lost");
			}
		} catch (error) {
			await notifyError(
				"Backup Failed",
				error instanceof Error ? error.message : "Unknown error occurred",
			);
		}
	};

	return (
		<div className="p-4 border rounded">
			<h3 className="text-lg font-semibold mb-4">Quick Backup</h3>
			<button
				onClick={performBackup}
				className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
			>
				Start Backup
			</button>
		</div>
	);
}
