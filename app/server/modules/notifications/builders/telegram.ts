import type { NotificationConfig } from "~/schemas/notifications";

export function buildTelegramShoutrrrUrl(config: Extract<NotificationConfig, { type: "telegram" }>): string {
	return `telegram://${config.botToken}@telegram?channels=${config.chatId}`;
}
