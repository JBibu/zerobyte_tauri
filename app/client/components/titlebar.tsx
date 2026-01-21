import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "~/client/lib/utils";

declare global {
	interface Window {
		__TAURI__?: {
			window: {
				getCurrentWindow: () => {
					minimize: () => Promise<void>;
					toggleMaximize: () => Promise<void>;
					close: () => Promise<void>;
					onResized: (handler: (event: { payload: { width: number; height: number } }) => void) => Promise<() => void>;
				};
			};
		};
	}
}

export function Titlebar() {
	const [isMaximized, setIsMaximized] = useState(false);

	useEffect(() => {
		if (!window.__TAURI__) return;

		const appWindow = window.__TAURI__.window.getCurrentWindow();

		// Listen for resize events to track maximize state
		let unlisten: (() => void) | undefined;
		appWindow.onResized(() => {
			// This is a simple approximation - a proper implementation would check actual maximize state
			// For now, we'll just track if it's been maximized via our button
		}).then((fn) => {
			unlisten = fn;
		});

		return () => {
			unlisten?.();
		};
	}, []);

	const handleMinimize = async () => {
		if (!window.__TAURI__) return;
		const appWindow = window.__TAURI__.window.getCurrentWindow();
		await appWindow.minimize();
	};

	const handleMaximize = async () => {
		if (!window.__TAURI__) return;
		const appWindow = window.__TAURI__.window.getCurrentWindow();
		await appWindow.toggleMaximize();
		setIsMaximized(!isMaximized);
	};

	const handleClose = async () => {
		if (!window.__TAURI__) return;
		const appWindow = window.__TAURI__.window.getCurrentWindow();
		await appWindow.close();
	};

	// Don't render if not in Tauri
	if (!window.__TAURI__) {
		return null;
	}

	return (
		<div
			className={cn(
				"fixed top-0 left-0 right-0 z-50 h-9",
				"bg-background border-b border-border",
				"flex items-center justify-between",
				"select-none"
			)}
		>
			{/* Drag region - entire titlebar except buttons */}
			<div
				data-tauri-drag-region
				className="flex-1 h-full flex items-center px-4 cursor-move"
			>
				<span className="text-sm font-medium text-foreground">
					C3i Servicios Informáticos
				</span>
			</div>

			{/* Window Controls */}
			<div className="flex items-center h-full">
				<button
					type="button"
					onClick={handleMinimize}
					className={cn(
						"h-full px-4 hover:bg-accent transition-colors",
						"flex items-center justify-center",
						"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					)}
					title="Minimize"
				>
					<Minus className="w-4 h-4" />
				</button>
				<button
					type="button"
					onClick={handleMaximize}
					className={cn(
						"h-full px-4 hover:bg-accent transition-colors",
						"flex items-center justify-center",
						"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					)}
					title={isMaximized ? "Restore" : "Maximize"}
				>
					<Square className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					onClick={handleClose}
					className={cn(
						"h-full px-4 hover:bg-destructive hover:text-destructive-foreground transition-colors",
						"flex items-center justify-center",
						"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					)}
					title="Close"
				>
					<X className="w-4 h-4" />
				</button>
			</div>
		</div>
	);
}
