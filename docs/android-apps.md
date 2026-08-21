# Android applications

Mimorii ships separate Client and Agent APKs from one Tauri workspace.

- `app.mimorii.monitor` starts at authentication and contains the mobile Client navigation.
- `app.mimorii.agent` contains only the Agent entry point and native Agent plugin. It starts at activation or Agent status.

The build selects separate Vite entries, Cargo features, Tauri capabilities, application IDs, and native plugins. The Client includes push support but no Agent worker or boot receiver. The Agent includes the Agent plugin but no Client routes, authentication, marketing interface, push plugin, or Firebase service.

## Agent background model

The Agent uses a native Kotlin Tauri plugin. Enrollment is verified with the server before the collector identity, interval, and encrypted credential are committed. Android Keystore protects the encryption key; app backup and device transfer exclude Agent state.

Device status is short, periodic, deferrable work, so the Agent uses WorkManager 2.11.2 instead of a foreground service:

- One unique periodic request schedules collection every 15 to 60 minutes.
- One unique, network-constrained worker performs the device-status submission and retries transient failures.
- WorkManager persists its schedule across process recreation, application restart, and device reboot.
- `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED` reconcile the persisted enrollment with the unique work after boot and upgrades.
- Loading the Agent UI performs the same reconciliation.

This native work does not depend on the Tauri WebView remaining alive. Tauri's supported Android plugin model keeps the UI command surface in Kotlin while the React interface remains a client of the same native state.

A foreground service is intentionally not used. The collection normally completes in seconds, does not require continuous execution, and is allowed to be deferred. The Agent therefore does not request foreground-service or notification permission and does not display a persistent notification. Android 15 also prevents a `BOOT_COMPLETED` receiver from starting a `dataSync` foreground service and applies time limits to that service type.

## Android support and permissions

Both APKs support Android 7.0 and newer (`minSdk 24`), target API 36, and include `arm64-v8a`, `armeabi-v7a`, and `x86_64`. Release builds use NDK 30 and support 16 KiB memory pages.

The Agent manifest contains:

| Permission               | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `INTERNET`               | Verify enrollment and submit device status.       |
| `ACCESS_NETWORK_STATE`   | Apply WorkManager's connected-network constraint. |
| `RECEIVE_BOOT_COMPLETED` | Reconcile scheduled work after boot.              |
| `WAKE_LOCK`              | Allow WorkManager to finish a scheduled worker.   |

The Client contains `INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, FCM receive, and `POST_NOTIFICATIONS`. Android prompts only for notification permission, on Android 13 and newer, when push is enabled. The Client has no Agent worker or boot receiver. The Agent does not request `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, exact-alarm, location, or battery-optimization exemption permissions.

The Client registers a Firebase Installation ID with the signed-in Mimorii account, refreshes that registration when Firebase rotates it, and removes it when notifications are disabled or the user signs out. FCM notification payloads can be displayed while the Client is backgrounded or closed; selecting one opens its incident or resource. See [Notifications](notifications.md) for Firebase credentials, build values, server setup, and end-to-end tests.

## Platform limits and recovery

Android does not provide desktop-service semantics:

- A 15-minute interval is WorkManager's minimum. Execution time is not exact.
- Doze, App Standby, background restriction, unavailable networks, system quotas, and manufacturer power policies can defer work.
- The operating system may terminate the process. WorkManager recreates eligible work later.
- Force Stop places the package in a stopped state. No background API can restart it until the user opens or otherwise interacts with the app. Android 15 delivers `BOOT_COMPLETED` after the user removes that stopped state, allowing reconciliation.
- A newly installed Agent must be opened and activated before background work exists.

When Android reports that background use is restricted, the Agent shows `Allow background access`, which opens the application's system settings. No battery or notification prompt is shown when it is not required.

## References

- [Tauri mobile plugin development](https://v2.tauri.app/develop/plugins/develop-mobile/)
- [Android persistent work guidance](https://developer.android.com/develop/background-work/background-tasks/persistent)
- [Android periodic work constraints](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)
- [Android data-transfer background options](https://developer.android.com/develop/background-work/background-tasks/data-transfer-options)
- [Android Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
- [Android background restrictions](https://developer.android.com/develop/background-work/background-tasks/bg-work-restrictions)
- [Android 15 foreground-service changes](https://developer.android.com/about/versions/15/behavior-changes-15)
- [Android 15 stopped-state changes](https://developer.android.com/about/versions/15/behavior-changes-all)
