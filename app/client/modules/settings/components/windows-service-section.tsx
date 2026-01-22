import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Cog, Download, ExternalLink, Loader2, Play, RefreshCw, Square, Trash2, XCircle } from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";
import { Button } from "~/client/components/ui/button";
import { CardContent, CardDescription, CardTitle } from "~/client/components/ui/card";
import { useSystemInfo } from "~/client/hooks/use-system-info";
import { isTauri, invoke } from "~/client/lib/tauri";
import { useTranslation } from "react-i18next";

type ServiceStatusString = "running" | "stopped" | "not_installed" | "unknown";

interface ServiceStatusResponse {
	installed: boolean;
	running: boolean;
	start_type: string | null;
}

interface BackendInfo {
	url: string;
	port: number;
	using_service: boolean;
}

export function WindowsServiceSection() {
	const { t } = useTranslation();
	const { platform } = useSystemInfo();
	const [serviceStatus, setServiceStatus] = useState<ServiceStatusString>("unknown");
	const [isLoading, setIsLoading] = useState(false);
	const [actionInProgress, setActionInProgress] = useState<string | null>(null);
	const [backendInfo, setBackendInfo] = useState<BackendInfo | null>(null);

	const isWindows = platform?.os === "windows";
	const inTauri = isTauri();

	const fetchServiceStatus = useCallback(async () => {
		if (!inTauri) return;

		try {
			setIsLoading(true);
			const response = await invoke<ServiceStatusResponse>("get_service_status");

			if (!response.installed) {
				setServiceStatus("not_installed");
			} else if (response.running) {
				setServiceStatus("running");
			} else {
				setServiceStatus("stopped");
			}
		} catch {
			setServiceStatus("unknown");
		} finally {
			setIsLoading(false);
		}
	}, [inTauri]);

	const fetchBackendInfo = useCallback(async () => {
		if (!inTauri) return;

		try {
			const info = await invoke<BackendInfo>("get_backend_info");
			setBackendInfo(info);
		} catch {
			// Ignore errors
		}
	}, [inTauri]);

	useEffect(() => {
		if (isWindows && inTauri) {
			void fetchServiceStatus();
			void fetchBackendInfo();
		}
	}, [isWindows, inTauri, fetchServiceStatus, fetchBackendInfo]);

	// Don't render if not on Windows or not in Tauri
	if (!isWindows || !inTauri) {
		return null;
	}

	const handleInstall = async () => {
		setActionInProgress("install");
		try {
			await invoke("install_service");
			toast.success(t("settings.windowsService.toast.installSuccess"));
			await fetchServiceStatus();
		} catch (error) {
			toast.error(t("settings.windowsService.toast.installFailed"), {
				description: error instanceof Error ? error.message : "An error occurred",
			});
		} finally {
			setActionInProgress(null);
		}
	};

	const handleUninstall = async () => {
		setActionInProgress("uninstall");
		try {
			await invoke("uninstall_service");
			toast.success(t("settings.windowsService.toast.uninstallSuccess"));
			await fetchServiceStatus();
		} catch (error) {
			toast.error(t("settings.windowsService.toast.uninstallFailed"), {
				description: error instanceof Error ? error.message : "An error occurred",
			});
		} finally {
			setActionInProgress(null);
		}
	};

	const handleStart = async () => {
		setActionInProgress("start");
		try {
			await invoke("start_service");
			toast.success(t("settings.windowsService.toast.startSuccess"));
			await fetchServiceStatus();
		} catch (error) {
			toast.error(t("settings.windowsService.toast.startFailed"), {
				description: error instanceof Error ? error.message : "An error occurred",
			});
		} finally {
			setActionInProgress(null);
		}
	};

	const handleStop = async () => {
		setActionInProgress("stop");
		try {
			await invoke("stop_service");
			toast.success(t("settings.windowsService.toast.stopSuccess"));
			await fetchServiceStatus();
		} catch (error) {
			toast.error(t("settings.windowsService.toast.stopFailed"), {
				description: error instanceof Error ? error.message : "An error occurred",
			});
		} finally {
			setActionInProgress(null);
		}
	};

	const handleOpenServiceUI = () => {
		window.open("http://localhost:4097", "_blank");
	};

	const handleRestart = async () => {
		setActionInProgress("restart");
		try {
			await relaunch();
		} catch (error) {
			toast.error(t("settings.windowsService.toast.restartFailed"), {
				description: error instanceof Error ? error.message : "An error occurred",
			});
			setActionInProgress(null);
		}
	};

	// Check if there's a mismatch between service state and current connection
	const needsRestart =
		backendInfo &&
		((serviceStatus === "running" && !backendInfo.using_service) ||
			(serviceStatus === "stopped" && backendInfo.using_service) ||
			(serviceStatus === "not_installed" && backendInfo.using_service));

	const getStatusIcon = () => {
		if (isLoading) {
			return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
		}
		switch (serviceStatus) {
			case "running":
				return <CheckCircle className="h-4 w-4 text-green-500" />;
			case "stopped":
				return <XCircle className="h-4 w-4 text-yellow-500" />;
			case "not_installed":
				return <XCircle className="h-4 w-4 text-muted-foreground" />;
			default:
				return <XCircle className="h-4 w-4 text-muted-foreground" />;
		}
	};

	const getStatusText = () => {
		switch (serviceStatus) {
			case "running":
				return <span className="text-green-500">{t("settings.windowsService.statusRunning")}</span>;
			case "stopped":
				return <span className="text-yellow-500">{t("settings.windowsService.statusStopped")}</span>;
			case "not_installed":
				return <span className="text-muted-foreground">{t("settings.windowsService.statusNotInstalled")}</span>;
			default:
				return <span className="text-muted-foreground">{t("settings.windowsService.statusUnknown")}</span>;
		}
	};

	return (
		<>
			<div className="border-t border-border/50 bg-card-header p-6">
				<CardTitle className="flex items-center gap-2">
					<Cog className="size-5" />
					{t("settings.windowsService.title")}
				</CardTitle>
				<CardDescription className="mt-1.5">
					{t("settings.windowsService.description")}
				</CardDescription>
			</div>
			<CardContent className="p-6 space-y-4">
				<div className="flex items-start justify-between gap-4">
					<div className="space-y-1 flex-1">
						<div className="flex items-center gap-2">
							{getStatusIcon()}
							<p className="text-sm font-medium">{t("settings.windowsService.statusLabel")} {getStatusText()}</p>
						</div>
						<p className="text-xs text-muted-foreground max-w-xl">
							{t("settings.windowsService.helper")}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					{serviceStatus === "not_installed" && (
						<Button disabled variant="default">
							<Download className="h-4 w-4 mr-2" />
							{t("settings.windowsService.installButton")}
						</Button>
					)}

					{serviceStatus === "stopped" && (
						<>
							<Button disabled variant="default">
								<Play className="h-4 w-4 mr-2" />
								{t("settings.windowsService.startButton")}
							</Button>
							<Button disabled variant="outline">
								<Trash2 className="h-4 w-4 mr-2" />
								{t("settings.windowsService.uninstallButton")}
							</Button>
						</>
					)}

					{serviceStatus === "running" && (
						<>
							<Button disabled variant="default">
								<ExternalLink className="h-4 w-4 mr-2" />
								{t("settings.windowsService.openUIButton")}
							</Button>
							<Button disabled variant="outline">
								<Square className="h-4 w-4 mr-2" />
								{t("settings.windowsService.stopButton")}
							</Button>
						</>
					)}
				</div>

				<p className="text-xs text-yellow-500">
					{t("settings.windowsService.windowsServerOnly")}
				</p>

				{serviceStatus === "running" && (
					<p className="text-xs text-muted-foreground">
						{t("settings.windowsService.helperRunning")}
					</p>
				)}

				{backendInfo && (
					<div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border/50">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-xs font-medium mb-1">{t("settings.windowsService.currentConnection.title")}</p>
								<div className="flex items-center gap-2">
									<span
										className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
											backendInfo.using_service
												? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
												: "bg-green-500/20 text-green-400 border border-green-500/30"
										}`}
									>
										{backendInfo.using_service ? t("settings.windowsService.currentConnection.serviceMode") : t("settings.windowsService.currentConnection.desktopMode")}
									</span>
									<span className="text-xs text-muted-foreground">{t("settings.windowsService.currentConnection.port")} {backendInfo.port}</span>
								</div>
							</div>
							{needsRestart && (
								<Button onClick={handleRestart} disabled={!!actionInProgress} variant="outline" size="sm">
									{actionInProgress === "restart" ? (
										<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									) : (
										<RefreshCw className="h-4 w-4 mr-2" />
									)}
									{t("settings.windowsService.currentConnection.restartButton")}
								</Button>
							)}
						</div>
						{needsRestart && (
							<p className="text-xs text-yellow-500 mt-2">
								{serviceStatus === "running" ? t("settings.windowsService.currentConnection.warningService") : t("settings.windowsService.currentConnection.warningDesktop")}
							</p>
						)}
					</div>
				)}
			</CardContent>
		</>
	);
}
