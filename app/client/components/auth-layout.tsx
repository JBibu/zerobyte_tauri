import type { ReactNode } from "react";
import { Titlebar } from "./titlebar";

type AuthLayoutProps = {
	title: string;
	description: string;
	children: ReactNode;
};

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
	return (
		<>
			<Titlebar />
			<div className="flex mt-[25%] lg:mt-0 lg:min-h-screen pt-9">
				<div className="flex flex-1 items-center justify-center bg-background p-8">
				<div className="w-full max-w-md space-y-8">
					<div className="flex items-center gap-3">
						<img src="/images/zerobyte.png" alt="C3i Backup ONE Logo" className="h-5 w-5 object-contain" />
						<span className="text-lg font-semibold">C3i Backup ONE</span>
					</div>

					<div className="space-y-2">
						<h1 className="text-3xl font-bold tracking-tight">{title}</h1>
						<p className="text-sm text-muted-foreground">{description}</p>
					</div>

					{children}
				</div>
			</div>
				<div
					className="hidden lg:block lg:flex-1 bg-cover bg-center"
					style={{ backgroundImage: "url(/images/background.jpg)" }}
				/>
			</div>
		</>
	);
}
