import { useCallback, useEffect, useState } from "react";
import { Loader2, Monitor, Power } from "lucide-react";
import { toast } from "sonner";
import { CardContent, CardDescription, CardTitle } from "~/client/components/ui/card";
import { Switch } from "~/client/components/ui/switch";
import { Label } from "~/client/components/ui/label";
import { isTauri } from "~/client/lib/tauri";

export function AppSettingsSection() {
	const [autostartEnabled, setAutostartEnabled] = useState(false);
	const [isLoadingAutostart, setIsLoadingAutostart] = useState(true);
	const [isTogglingAutostart, setIsTogglingAutostart] = useState(false);

	const inTauri = isTauri();

	const checkAutostartStatus = useCallback(async () => {
		if (!inTauri) return;

		try {
			setIsLoadingAutostart(true);
			const { isEnabled } = await import("@tauri-apps/plugin-autostart");
			const enabled = await isEnabled();
			setAutostartEnabled(enabled);
		} catch {
			// Silently fail - autostart status will remain false
		} finally {
			setIsLoadingAutostart(false);
		}
	}, [inTauri]);

	useEffect(() => {
		if (inTauri) {
			void checkAutostartStatus();
		}
	}, [inTauri, checkAutostartStatus]);

	// Don't render if not in Tauri
	if (!inTauri) {
		return null;
	}

	const handleAutostartToggle = async (enabled: boolean) => {
		setIsTogglingAutostart(true);
		try {
			const { enable, disable } = await import("@tauri-apps/plugin-autostart");

			if (enabled) {
				await enable();
				toast.success("C3i Backup ONE will now start automatically on login");
			} else {
				await disable();
				toast.success("Automatic startup disabled");
			}

			setAutostartEnabled(enabled);
		} catch (error) {
			toast.error("Failed to change autostart setting", {
				description: error instanceof Error ? error.message : "An error occurred",
			});
		} finally {
			setIsTogglingAutostart(false);
		}
	};

	return (
		<>
			<div className="border-t border-border/50 bg-card-header p-6">
				<CardTitle className="flex items-center gap-2">
					<Monitor className="size-5" />
					Application Settings
				</CardTitle>
				<CardDescription className="mt-1.5">Configure how C3i Backup ONE behaves on your system</CardDescription>
			</div>
			<CardContent className="p-6 space-y-6">
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-1 flex-1">
						<div className="flex items-center gap-2">
							<Power className="h-4 w-4 text-muted-foreground" />
							<Label htmlFor="autostart" className="text-sm font-medium cursor-pointer">
								Launch at startup
							</Label>
						</div>
						<p className="text-xs text-muted-foreground max-w-xl">
							Automatically start C3i Backup ONE when you log in to your computer. The app will start minimized in the
							system tray.
						</p>
					</div>
					<div className="flex items-center gap-2">
						{(isLoadingAutostart || isTogglingAutostart) && (
							<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
						)}
						<Switch
							id="autostart"
							checked={autostartEnabled}
							onCheckedChange={handleAutostartToggle}
							disabled={isLoadingAutostart || isTogglingAutostart}
						/>
					</div>
				</div>

				<div className="border-t border-border/30 pt-4">
					<p className="text-xs text-muted-foreground">
						<strong>Tip:</strong> Closing the window minimizes the app to the system tray. Use the tray icon to access
						the app or select "Quit" to fully exit.
					</p>
				</div>
			</CardContent>
		</>
	);
}
