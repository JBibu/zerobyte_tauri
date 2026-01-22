import { useQuery } from "@tanstack/react-query";
import { FileText, FolderOpen, RefreshCw } from "lucide-react";
import { useState } from "react";
import { client } from "~/client/api-client/client.gen";
import { Button } from "~/client/components/ui/button";
import { CardContent, CardDescription, CardTitle } from "~/client/components/ui/card";
import { isTauri } from "~/client/lib/tauri";

type LogsResponse = {
	logs: string;
	path: string;
};

export function LogViewerSection() {
	const [lines, setLines] = useState(200);

	const { data, isLoading, refetch, isFetching } = useQuery({
		queryKey: ["logs", lines],
		queryFn: async () => {
			const response = await client.get({
				url: "/api/v1/system/logs",
				query: { lines: String(lines) },
			});
			return response.data as LogsResponse | undefined;
		},
		refetchInterval: false,
	});

	const handleOpenFolder = async () => {
		if (!data?.path) return;

		if (isTauri()) {
			const { invoke } = await import("@tauri-apps/api/core");
			const folderPath = data.path.replace(/[/\\][^/\\]+$/, "");
			try {
				await invoke("plugin:shell|open", { path: folderPath });
			} catch (e) {
				console.error("Failed to open folder:", e);
			}
		}
	};

	return (
		<>
			<div className="border-t border-border/50 bg-card-header p-6">
				<CardTitle className="flex items-center gap-2">
					<FileText className="size-5" />
					Application Logs
				</CardTitle>
				<CardDescription className="mt-1.5">View recent application logs</CardDescription>
			</div>
			<CardContent className="p-6 space-y-4">
				<div className="flex items-center gap-2 flex-wrap">
					<Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
						<RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
						Refresh
					</Button>
					<select
						className="h-9 rounded-md border border-input bg-background px-3 text-sm"
						value={lines}
						onChange={(e) => setLines(Number(e.target.value))}
					>
						<option value={50}>Last 50 lines</option>
						<option value={100}>Last 100 lines</option>
						<option value={200}>Last 200 lines</option>
						<option value={500}>Last 500 lines</option>
						<option value={1000}>Last 1000 lines</option>
					</select>
					{isTauri() && data?.path && (
						<Button variant="outline" size="sm" onClick={handleOpenFolder}>
							<FolderOpen className="h-4 w-4 mr-2" />
							Open Folder
						</Button>
					)}
				</div>

				{data?.path && (
					<p className="text-xs text-muted-foreground font-mono">{data.path}</p>
				)}

				<div className="relative">
					<pre className="bg-muted rounded-md p-4 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap break-all">
						{isLoading ? "Loading logs..." : data?.logs || "No logs available."}
					</pre>
				</div>
			</CardContent>
		</>
	);
}
