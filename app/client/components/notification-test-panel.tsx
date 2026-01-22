/**
 * Notification Test Panel
 * Dev tool for testing Tauri notifications
 * Can be temporarily added to settings page or dashboard
 */

import { useState } from "react";
import { useNotifications } from "../hooks/use-notifications";
import { Button } from "./ui/button";

export function NotificationTestPanel() {
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

	const [lastResult, setLastResult] = useState<string>("");

	if (!isSupported) {
		return (
			<div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
				<p className="text-sm text-yellow-600 dark:text-yellow-400">
					Notifications are only available in the Tauri desktop app.
				</p>
			</div>
		);
	}

	if (isCheckingPermission) {
		return (
			<div className="rounded-lg border border-border bg-card p-4">
				<p className="text-sm text-muted-foreground">Checking notification permissions...</p>
			</div>
		);
	}

	const handleTest = async (
		fn: () => Promise<void>,
		label: string,
	) => {
		try {
			await fn();
			setLastResult(`✓ ${label} sent successfully`);
		} catch (error) {
			setLastResult(`✗ ${label} failed: ${error}`);
		}
	};

	return (
		<div className="space-y-4 rounded-lg border border-border bg-card p-6">
			<div>
				<h3 className="text-lg font-semibold">Notification Test Panel</h3>
				<p className="text-sm text-muted-foreground">
					Test desktop notifications in the Tauri app
				</p>
			</div>

			{/* Permission Status */}
			<div className="flex items-center gap-2 rounded border border-border p-3">
				<div
					className={`h-2 w-2 rounded-full ${
						isPermissionGranted ? "bg-green-500" : "bg-yellow-500"
					}`}
				/>
				<span className="text-sm">
					Permission: {isPermissionGranted ? "Granted" : "Not Granted"}
				</span>
				{!isPermissionGranted && (
					<Button onClick={requestPermission} size="sm" variant="outline">
						Request Permission
					</Button>
				)}
			</div>

			{/* Test Buttons */}
			{isPermissionGranted && (
				<div className="space-y-2">
					<div className="grid grid-cols-2 gap-2">
						<Button
							onClick={() =>
								handleTest(
									() => notify("Test Notification", "This is a basic test notification"),
									"Basic notification",
								)
							}
							variant="outline"
							size="sm"
						>
							Test Basic
						</Button>

						<Button
							onClick={() =>
								handleTest(
									() =>
										notifySuccess("Backup Complete", "Your files have been backed up successfully"),
									"Success notification",
								)
							}
							variant="outline"
							size="sm"
							className="border-green-500/50 text-green-600 hover:bg-green-500/10 dark:text-green-400"
						>
							Test Success
						</Button>

						<Button
							onClick={() =>
								handleTest(
									() =>
										notifyError("Backup Failed", "An error occurred during the backup process"),
									"Error notification",
								)
							}
							variant="outline"
							size="sm"
							className="border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400"
						>
							Test Error
						</Button>

						<Button
							onClick={() =>
								handleTest(
									() =>
										notifyWarning("Low Disk Space", "Your backup storage is running low on space"),
									"Warning notification",
								)
							}
							variant="outline"
							size="sm"
							className="border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10 dark:text-yellow-400"
						>
							Test Warning
						</Button>

						<Button
							onClick={() =>
								handleTest(
									() =>
										notifyInfo("Backup Scheduled", "Your next backup is scheduled for tomorrow"),
									"Info notification",
								)
							}
							variant="outline"
							size="sm"
							className="border-blue-500/50 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
						>
							Test Info
						</Button>

						<Button
							onClick={() =>
								handleTest(
									() =>
										notifySuccess(
											"Volume Mounted",
											"External backup drive is now accessible",
										),
									"Volume mounted notification",
								)
							}
							variant="outline"
							size="sm"
						>
							Test Volume Mount
						</Button>
					</div>

					{/* Backup Simulation */}
					<div className="rounded border border-border p-3">
						<p className="mb-2 text-sm font-medium">Simulate Backup Flow:</p>
						<Button
							onClick={async () => {
								try {
									setLastResult("Starting backup simulation...");
									await notifyInfo("Backup Started", "Backing up Documents to Cloud Storage");
									await new Promise((resolve) => setTimeout(resolve, 2000));

									const success = Math.random() > 0.3;
									if (success) {
										await notifySuccess(
											"Backup Complete",
											"Successfully backed up Documents to Cloud Storage",
										);
										setLastResult("✓ Backup simulation completed successfully");
									} else {
										await notifyError(
											"Backup Failed",
											"Network connection lost during backup",
										);
										setLastResult("✓ Backup simulation completed with error");
									}
								} catch (error) {
									setLastResult(`✗ Simulation failed: ${error}`);
								}
							}}
							variant="default"
							size="sm"
							className="w-full"
						>
							Simulate Full Backup
						</Button>
					</div>
				</div>
			)}

			{/* Last Result */}
			{lastResult && (
				<div className="rounded bg-muted p-3">
					<p className="font-mono text-xs">{lastResult}</p>
				</div>
			)}

			{/* Instructions */}
			<div className="rounded bg-muted p-3 text-xs text-muted-foreground">
				<p className="font-semibold">Note:</p>
				<ul className="ml-4 mt-1 list-disc space-y-1">
					<li>Notifications only work in production Tauri builds with proper branding</li>
					<li>In development mode, notifications show with PowerShell branding on Windows</li>
					<li>Check your system notification center to see delivered notifications</li>
				</ul>
			</div>
		</div>
	);
}
