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
	} = useNotifications();

	const [lastResult, setLastResult] = useState("");

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

	const handleTest = async (title: string, body: string) => {
		try {
			await notify(title, body);
			setLastResult(`Sent: ${title}`);
		} catch (error) {
			setLastResult(`Failed: ${error}`);
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
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

			{isPermissionGranted && (
				<div className="flex flex-wrap gap-2">
					<Button
						onClick={() => handleTest("Test Notification", "This is a test notification")}
						variant="outline"
						size="sm"
					>
						Send Test
					</Button>
					<Button
						onClick={() => handleTest("Backup Complete", "Your files have been backed up")}
						variant="outline"
						size="sm"
					>
						Test Backup
					</Button>
					<Button
						onClick={() => handleTest("Backup Failed", "An error occurred during backup")}
						variant="outline"
						size="sm"
					>
						Test Error
					</Button>
				</div>
			)}

			{lastResult && (
				<p className="font-mono text-xs text-muted-foreground">{lastResult}</p>
			)}
		</div>
	);
}
