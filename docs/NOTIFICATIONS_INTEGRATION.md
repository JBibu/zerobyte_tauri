# Tauri Notifications Integration Guide

This document describes how Tauri notifications have been integrated into the Zerobyte application.

## Overview

Native desktop notifications are now fully integrated into the application, providing real-time alerts for:
- Backup operations (started, completed, failed, warnings)
- Volume operations (mounted, unmounted)
- Mirror operations (started, completed, failed)

## What Was Added

### 1. Core Notification Library
**File**: [app/client/lib/notifications.ts](../app/client/lib/notifications.ts)

Provides a type-safe wrapper around the Tauri notification plugin with:
- Permission management functions
- Notification sending functions
- Helper functions for different notification types
- Browser fallback support

**Key Functions**:
```typescript
// Permission functions
await isNotificationPermissionGranted()
await requestNotificationPermission()

// Sending notifications
await sendNotification({ title, body, icon })
await notify(title, body, icon)
await notifySuccess(title, body)
await notifyError(title, body)
await notifyWarning(title, body)
await notifyInfo(title, body)

// Advanced features (mobile)
await createNotificationChannel(channel)
await registerNotificationActionTypes(actionTypes)
```

### 2. React Hook
**File**: [app/client/hooks/use-notifications.ts](../app/client/hooks/use-notifications.ts)

Provides a convenient React hook for using notifications:
```typescript
const {
  isSupported,           // Whether notifications are supported
  isPermissionGranted,   // Whether permission is granted
  isCheckingPermission,  // Loading state
  requestPermission,     // Request permission function
  notify,                // Send simple notification
  notifySuccess,         // Send success notification
  notifyError,          // Send error notification
  notifyWarning,        // Send warning notification
  notifyInfo,           // Send info notification
} = useNotifications();
```

### 3. Server Events Integration
**File**: [app/client/hooks/use-server-events.ts](../app/client/hooks/use-server-events.ts)

Modified to automatically send notifications for server events:

| Event | Notification Type | When Shown |
|-------|------------------|------------|
| `backup:started` | Info | When a backup begins |
| `backup:completed` (success) | Success | Backup completes successfully |
| `backup:completed` (warning) | Warning | Backup completes with warnings |
| `backup:completed` (error) | Error | Backup fails |
| `backup:completed` (stopped) | Info | Backup is stopped manually |
| `volume:mounted` | Success | Volume is mounted |
| `volume:unmounted` | Info | Volume is unmounted |
| `mirror:started` | Info | Mirror operation begins |
| `mirror:completed` (success) | Success | Mirror completes successfully |
| `mirror:completed` (error) | Error | Mirror operation fails |

**Example Notification**:
- **Backup Started**: "Backing up Documents to Cloud Storage"
- **Backup Complete**: "Successfully backed up Documents to Cloud Storage"
- **Backup Failed**: "Failed to backup Documents to Cloud Storage: Network timeout"

### 4. Permission Prompt Component
**File**: [app/client/components/notification-permission-prompt.tsx](../app/client/components/notification-permission-prompt.tsx)

A non-intrusive bottom-right prompt that:
- Only appears in Tauri desktop environment
- Asks users to enable notifications
- Can be dismissed (stored in localStorage)
- Auto-hides after permission is granted or prompted once

### 5. Test Panel
**File**: [app/client/components/notification-test-panel.tsx](../app/client/components/notification-test-panel.tsx)

Added to Settings page (only visible in Tauri) for testing:
- Permission status display
- Test buttons for all notification types
- Backup simulation
- Real-time feedback

**Location**: Settings > Notification Testing (bottom of page)

### 6. Root Layout Integration
**File**: [app/root.tsx](../app/root.tsx)

Added the `NotificationPermissionPrompt` component to the root layout so it appears on every page until dismissed or permission is granted.

## How It Works

### Automatic Notifications

The application automatically sends notifications when:

1. **User starts a backup** → Info notification
2. **Backup completes successfully** → Success notification
3. **Backup fails** → Error notification with error message
4. **Backup completes with warnings** → Warning notification
5. **Volume is mounted** → Success notification
6. **Volume is unmounted** → Info notification
7. **Mirror operation starts** → Info notification
8. **Mirror operation completes** → Success/Error notification

### Permission Flow

1. When the user first opens the Tauri app, a permission prompt appears
2. User can click "Enable Notifications" to grant permission
3. User can click "Not Now" to dismiss (won't show again)
4. If dismissed, user can still enable from Settings > Notification Testing
5. Permission state is managed by the OS and persists across sessions

### Testing

To test notifications:

1. Open the Tauri desktop app: `bun run tauri:dev`
2. Navigate to **Settings** (bottom-left sidebar)
3. Scroll to the **Notification Testing** section
4. Grant permission if prompted
5. Click any test button to send a notification
6. Check your system notification center

**Test Options**:
- Test Basic
- Test Success
- Test Error
- Test Warning
- Test Info
- Test Volume Mount
- Simulate Full Backup (with delay)

## Platform Behavior

### Windows
- Notifications work only for **installed apps** in production
- In development mode, shows **PowerShell name & icon**
- For proper branding, build and install: `bun run tauri:build`
- Notifications appear in Windows Action Center

### Linux
- Full notification support
- Appears via desktop environment's notification system
- Tested on Ubuntu/GNOME, KDE, XFCE

### macOS
- Full notification support
- Appears in Notification Center
- Respects system Do Not Disturb settings

## Integration Points

### In Components
```tsx
import { useNotifications } from "~/hooks/use-notifications";

function MyComponent() {
  const { notifySuccess, notifyError } = useNotifications();

  const handleAction = async () => {
    try {
      // ... perform action ...
      await notifySuccess("Action Complete", "Your action was successful");
    } catch (error) {
      await notifyError("Action Failed", error.message);
    }
  };

  return <button onClick={handleAction}>Do Something</button>;
}
```

### In Services
```typescript
import { notify } from "~/lib/notifications";

async function performBackup() {
  await notify("Backup Started", "Preparing to backup...");
  // ... backup logic ...
  await notify("Backup Complete", "All files backed up successfully");
}
```

### Server Events (Automatic)
No code needed! Notifications are automatically sent when server events occur because the `useServerEvents()` hook is already integrated.

## Configuration

### Notification Permissions
**File**: [src-tauri/capabilities/default.json](../src-tauri/capabilities/default.json)

The `notification:default` permission includes all notification capabilities:
```json
{
  "permissions": [
    "notification:default"
  ]
}
```

### Rust Plugin
**File**: [src-tauri/src/lib.rs:256](../src-tauri/src/lib.rs#L256)

The notification plugin is initialized in the Tauri builder:
```rust
.plugin(tauri_plugin_notification::init())
```

## Customization

### Custom Icons
To add custom icons for different notification types:

```typescript
await sendNotification({
  title: "Custom Notification",
  body: "This has a custom icon",
  icon: "path/to/icon.png", // Relative to public directory
});
```

### Custom Sounds
To add custom notification sounds (mobile):

```typescript
await sendNotification({
  title: "Custom Sound",
  body: "This plays a custom sound",
  sound: "notification_sound", // Sound file name
});
```

### Notification Channels (Android)
For Android apps, create notification channels:

```typescript
import { createNotificationChannel, NotificationImportance } from "~/lib/notifications";

await createNotificationChannel({
  id: "backups",
  name: "Backup Notifications",
  description: "Notifications for backup operations",
  importance: NotificationImportance.High,
  vibration: true,
  lights: true,
  lightColor: "#0066cc",
});

// Then use the channel
await sendNotification({
  title: "Backup Complete",
  body: "All done!",
  channelId: "backups",
});
```

## Troubleshooting

### Notifications Not Showing

**Problem**: Notifications don't appear

**Solutions**:
1. Check if running in Tauri: Only works in desktop app, not browser
2. Check permission: Navigate to Settings > Notification Testing to verify
3. Check system settings: Ensure notifications are enabled in OS settings
4. Check Do Not Disturb: Disable Do Not Disturb mode
5. Windows dev mode: Build and install app for proper branding

### Permission Already Denied

**Problem**: User previously denied permission

**Solutions**:
1. Windows: Settings > System > Notifications > Enable for your app
2. macOS: System Preferences > Notifications > Enable for your app
3. Linux: Varies by desktop environment

### Testing in Development

**Windows Development Notes**:
- Notifications show with PowerShell branding in dev mode
- This is normal Windows behavior for unsigned apps
- Build and install the app to see proper branding

**To test properly**:
```bash
# Build production version
bun run tauri:build

# Install the MSI/NSIS installer from src-tauri/target/release/bundle/
# Then test notifications with proper branding
```

## Files Modified/Created

### Created Files
- [app/client/lib/notifications.ts](../app/client/lib/notifications.ts) - Core notification library
- [app/client/hooks/use-notifications.ts](../app/client/hooks/use-notifications.ts) - React hook
- [app/client/components/notification-permission-prompt.tsx](../app/client/components/notification-permission-prompt.tsx) - Permission prompt
- [app/client/components/notification-test-panel.tsx](../app/client/components/notification-test-panel.tsx) - Test panel
- [docs/TAURI_NOTIFICATIONS.md](TAURI_NOTIFICATIONS.md) - API documentation
- [docs/tauri-notifications-example.tsx](tauri-notifications-example.tsx) - Usage examples

### Modified Files
- [app/root.tsx](../app/root.tsx) - Added permission prompt
- [app/client/hooks/use-server-events.ts](../app/client/hooks/use-server-events.ts) - Integrated notifications
- [app/client/modules/settings/routes/settings.tsx](../app/client/modules/settings/routes/settings.tsx) - Added test panel
- [package.json](../package.json) - Added `@tauri-apps/plugin-notification`
- [src-tauri/Cargo.toml](../src-tauri/Cargo.toml) - Added `tauri-plugin-notification`
- [src-tauri/src/lib.rs](../src-tauri/src/lib.rs) - Initialized plugin
- [src-tauri/capabilities/default.json](../src-tauri/capabilities/default.json) - Added permissions

## Best Practices

1. **Always check `isTauri()`**: Only send notifications in Tauri environment
2. **Handle errors gracefully**: Wrap notification calls in try-catch
3. **Keep messages concise**: Title max 50 chars, body max 100 chars
4. **Don't spam**: Avoid sending too many notifications in quick succession
5. **Use appropriate types**: Success for positive, Error for failures, Info for neutral
6. **Test on target platforms**: Behavior varies across Windows/macOS/Linux

## Future Enhancements

Potential additions:
- [ ] Custom notification sounds for different event types
- [ ] Notification action buttons (mobile)
- [ ] Notification grouping/stacking
- [ ] User preference toggles (enable/disable specific notification types)
- [ ] Notification history viewer
- [ ] Priority levels for notifications

## Support

For issues or questions:
- Check [TAURI_NOTIFICATIONS.md](TAURI_NOTIFICATIONS.md) for API reference
- Review [tauri-notifications-example.tsx](tauri-notifications-example.tsx) for usage examples
- Visit [Tauri Notification Plugin Docs](https://v2.tauri.app/plugin/notification/)
- Test using Settings > Notification Testing panel
