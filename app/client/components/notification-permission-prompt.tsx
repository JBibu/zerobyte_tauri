import { useEffect, useState } from "react";
import { useNotifications } from "../hooks/use-notifications";
import { Button } from "./ui/button";

export function NotificationPermissionPrompt() {
	const {
		isSupported,
		isPermissionGranted,
		isCheckingPermission,
		requestPermission,
	} = useNotifications();

	const [isDismissed, setIsDismissed] = useState(false);
	const [hasPrompted, setHasPrompted] = useState(false);

	useEffect(() => {
		const dismissed = localStorage.getItem("notification-permission-dismissed");
		if (dismissed === "true") {
			setIsDismissed(true);
		}

		const prompted = localStorage.getItem("notification-permission-prompted");
		if (prompted === "true") {
			setHasPrompted(true);
		}
	}, []);

	const handleEnableNotifications = async () => {
		await requestPermission();
		localStorage.setItem("notification-permission-prompted", "true");
		setHasPrompted(true);
	};

	const handleDismiss = () => {
		localStorage.setItem("notification-permission-dismissed", "true");
		setIsDismissed(true);
	};

	if (
		!isSupported ||
		isCheckingPermission ||
		isPermissionGranted ||
		isDismissed ||
		hasPrompted
	) {
		return null;
	}

	return (
		<div className="fixed bottom-4 right-4 z-50 w-96 rounded-lg border border-border bg-card p-4 shadow-lg">
			<div className="flex flex-col gap-3">
				<div className="flex items-start gap-3">
					<div className="flex-1">
						<h3 className="font-semibold">Enable Desktop Notifications</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Get notified about backup completions, errors, and important system events
							even when the app is minimized.
						</p>
					</div>
				</div>

				<div className="flex gap-2">
					<Button onClick={handleEnableNotifications} size="sm" className="flex-1">
						Enable Notifications
					</Button>
					<Button onClick={handleDismiss} variant="ghost" size="sm">
						Not Now
					</Button>
				</div>
			</div>
		</div>
	);
}
