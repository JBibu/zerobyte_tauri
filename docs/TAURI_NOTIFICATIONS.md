# Tauri Notifications Setup Guide

This document explains how to use native notifications in the Zerobyte Tauri application.

## Overview

The Tauri notification plugin has been integrated into the project, allowing you to send native system notifications on Windows, macOS, and Linux.

## Installation

The notification plugin has already been installed with:

```bash
bun tauri add notification
```

This automatically:
- Added `@tauri-apps/plugin-notification` to package.json
- Added `tauri-plugin-notification` to Cargo.toml
- Configured permissions in `src-tauri/capabilities/default.json`
- Initialized the plugin in `src-tauri/src/lib.rs`

## Configuration

### Permissions

The default notification permissions are configured in `src-tauri/capabilities/default.json`:

```json
{
  "permissions": [
    "notification:default"
  ]
}
```

The `notification:default` permission includes:
- `allow-is-permission-granted`
- `allow-request-permission`
- `allow-notify`
- `allow-register-action-types`
- `allow-register-listener`
- `allow-cancel`
- `allow-get-pending`
- `allow-remove-active`
- `allow-get-active`
- `allow-check-permissions`
- `allow-show`
- `allow-batch`
- `allow-list-channels`
- `allow-delete-channel`
- `allow-create-channel`
- `allow-permission-state`

### Tauri Configuration

The notification plugin is initialized in `src-tauri/src/lib.rs:256`:

```rust
.plugin(tauri_plugin_notification::init())
```

## Usage

### Basic Usage

#### 1. Using the React Hook (Recommended)

The easiest way to use notifications in React components:

```tsx
import { useNotifications } from "~/hooks/use-notifications";

function MyComponent() {
  const { notify, notifySuccess, notifyError, isPermissionGranted } = useNotifications();

  const handleAction = async () => {
    await notifySuccess("Action Complete", "Your action was successful!");
  };

  return (
    <button onClick={handleAction}>
      Perform Action
    </button>
  );
}
```

#### 2. Using the Notification Utility Functions

For use outside React components or in server-side code:

```typescript
import { notify, notifySuccess, notifyError } from "~/lib/notifications";

// Simple notification
await notify("Hello", "This is a notification!");

// Success notification
await notifySuccess("Backup Complete", "Your files have been backed up.");

// Error notification
await notifyError("Backup Failed", "An error occurred during backup.");
```

### Available Helper Functions

The notification system provides several convenience functions:

```typescript
// Simple notification
await notify(title: string, body?: string, icon?: string)

// Typed notifications
await notifySuccess(title: string, body?: string)
await notifyError(title: string, body?: string)
await notifyWarning(title: string, body?: string)
await notifyInfo(title: string, body?: string)

// Advanced: Custom notification with all options
await sendNotification({
  title: "Custom Notification",
  body: "This is a custom notification",
  icon: "path/to/icon.png",
  sound: "notification_sound",
})
```

### Permission Handling

The notification system automatically handles permissions:

```typescript
import {
  isNotificationPermissionGranted,
  requestNotificationPermission
} from "~/lib/notifications";

// Check if permission is granted
const granted = await isNotificationPermissionGranted();

if (!granted) {
  // Request permission
  const permission = await requestNotificationPermission();
  console.log("Permission:", permission); // "granted", "denied", or "default"
}
```

### React Hook API

The `useNotifications()` hook provides:

```typescript
interface UseNotificationsReturn {
  // Whether notifications are supported (true in Tauri)
  isSupported: boolean;

  // Whether notification permission is granted
  isPermissionGranted: boolean;

  // Whether we're currently checking permission
  isCheckingPermission: boolean;

  // Request notification permission
  requestPermission: () => Promise<void>;

  // Send notifications
  sendNotification: (options: NotificationOptions) => Promise<void>;
  notify: (title: string, body?: string) => Promise<void>;
  notifySuccess: (title: string, body?: string) => Promise<void>;
  notifyError: (title: string, body?: string) => Promise<void>;
  notifyWarning: (title: string, body?: string) => Promise<void>;
  notifyInfo: (title: string, body?: string) => Promise<void>;
}
```

## Platform-Specific Notes

### Windows
- Notifications work only for installed apps
- In development mode, shows PowerShell name & icon
- For production, build and install the app to see proper branding

### Linux
- Full support for all notification features

### macOS
- Full support for all notification features

### Mobile (Android/iOS)
Additional features available on mobile:
- **Channels**: Organize notifications into categories
- **Actions**: Add interactive buttons to notifications
- **Attachments**: Include images or other media

See the [Tauri documentation](https://v2.tauri.app/plugin/notification/) for mobile-specific features.

## Integration Examples

### Example 1: Backup Completion

```typescript
import { notifySuccess } from "~/lib/notifications";

async function completeBackup(backupName: string) {
  // ... perform backup ...

  await notifySuccess(
    "Backup Complete",
    `${backupName} has been backed up successfully`
  );
}
```

### Example 2: Error Handling

```typescript
import { notifyError } from "~/lib/notifications";

async function handleBackupError(error: Error) {
  await notifyError(
    "Backup Failed",
    `An error occurred: ${error.message}`
  );
}
```

### Example 3: Background Task Notifications

```typescript
import { notifyInfo, notifySuccess } from "~/lib/notifications";

async function scheduledBackup() {
  await notifyInfo("Backup Started", "Scheduled backup is now running...");

  try {
    // ... perform backup ...
    await notifySuccess("Backup Complete", "Scheduled backup finished successfully");
  } catch (error) {
    await notifyError("Backup Failed", "Scheduled backup encountered an error");
  }
}
```

### Example 4: Permission Check Component

```tsx
import { useNotifications } from "~/hooks/use-notifications";

function NotificationPermissionPrompt() {
  const {
    isSupported,
    isPermissionGranted,
    isCheckingPermission,
    requestPermission
  } = useNotifications();

  if (!isSupported) {
    return null; // Not in Tauri, don't show
  }

  if (isCheckingPermission) {
    return <div>Checking permissions...</div>;
  }

  if (!isPermissionGranted) {
    return (
      <div className="alert">
        <p>Enable notifications to receive backup alerts</p>
        <button onClick={requestPermission}>
          Enable Notifications
        </button>
      </div>
    );
  }

  return null; // Permission granted, nothing to show
}
```

## API Reference

### Core Functions

#### `notify(title, body?, icon?)`
Send a simple notification.

#### `notifySuccess(title, body?)`
Send a success notification.

#### `notifyError(title, body?)`
Send an error notification.

#### `notifyWarning(title, body?)`
Send a warning notification.

#### `notifyInfo(title, body?)`
Send an info notification.

#### `sendNotification(options)`
Send a notification with custom options.

```typescript
interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  sound?: string;
  channelId?: string;         // Android
  largeIcon?: string;          // Mobile
  smallIcon?: string;          // Mobile
  actionTypeId?: string;       // Mobile
  attachments?: NotificationAttachment[];  // Mobile
}
```

### Permission Functions

#### `isNotificationPermissionGranted()`
Returns `Promise<boolean>` indicating if permission is granted.

#### `requestNotificationPermission()`
Returns `Promise<NotificationPermission>` with values: `"granted"`, `"denied"`, or `"default"`.

## Troubleshooting

### Notifications not showing

1. **Check if running in Tauri**: Notifications only work in the Tauri desktop app, not in the browser
2. **Check permissions**: Ensure notification permission has been granted
3. **Windows development**: In dev mode, notifications show with PowerShell branding. Build and install the app to see proper branding.

### Permission Issues

If users deny permission, you'll need to guide them to re-enable it in their system settings:
- **Windows**: Settings > System > Notifications
- **macOS**: System Preferences > Notifications
- **Linux**: Varies by desktop environment

## Testing

To test notifications during development:

1. Run the Tauri app: `bun run tauri:dev`
2. Use the test buttons in the example component (see `docs/tauri-notifications-example.tsx`)
3. Check system notification center to verify notifications appear

## Further Reading

- [Tauri Notification Plugin Documentation](https://v2.tauri.app/plugin/notification/)
- [Web Notification API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API) (for browser fallback)
- [Windows Notification Guidelines](https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/adaptive-interactive-toasts)

## Files

- **Utility Module**: `app/client/lib/notifications.ts`
- **React Hook**: `app/client/hooks/use-notifications.ts`
- **Examples**: `docs/tauri-notifications-example.tsx`
- **Rust Plugin Init**: `src-tauri/src/lib.rs:256`
- **Permissions Config**: `src-tauri/capabilities/default.json`
