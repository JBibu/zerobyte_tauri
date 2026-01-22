import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/client/components/ui/dialog";
import { isTauri } from "~/client/lib/tauri";

const DOCKER_RESET_COMMAND = "docker exec -it zerobyte bun run cli reset-password";

type ResetPasswordDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export const ResetPasswordDialog = ({ open, onOpenChange }: ResetPasswordDialogProps) => {
	const isDesktop = isTauri();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Reset your password</DialogTitle>
					<DialogDescription>
						{isDesktop
							? "To reset your password, use the CLI tool included with the application."
							: "To reset your password, run the following command on the server where C3i Backup ONE is installed."}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					{isDesktop ? (
						<>
							<div className="rounded-md bg-muted p-4 font-mono text-sm break-all select-all">
								zerobyte-cli reset-password
							</div>
							<p className="text-sm text-muted-foreground">
								Open a terminal in the application's installation directory and run this command.
								It will start an interactive session where you can enter a new password.
							</p>
						</>
					) : (
						<>
							<div className="rounded-md bg-muted p-4 font-mono text-sm break-all select-all">
								{DOCKER_RESET_COMMAND}
							</div>
							<p className="text-sm text-muted-foreground">
								This command will start an interactive session where you can enter a new password for your account.
							</p>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
