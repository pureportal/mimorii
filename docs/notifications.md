# Notifications

Mimorii sends browser notifications with standard Web Push and Android notifications with Firebase Cloud Messaging (FCM). A team owner or admin chooses recipients and events in **Alerting**. Each recipient enables or disables the current browser or Android device under **Account**, in **This device**.

Monitoring creates notifications on state changes, including failed checks, threshold breaches, recoveries, opened or resolved incidents, missed or recovered heartbeats, service-level objective breaches, and maintenance transitions. Retries of the same occurrence are deduplicated. A later occurrence or state change remains eligible for delivery.

## Browser setup

Web Push uses one VAPID key pair. Generate it once:

```bash
pnpm --filter @mimorii/api exec web-push generate-vapid-keys --json
```

Set these server values in `.env`:

| Value                                | Source                                               | Secret |
| ------------------------------------ | ---------------------------------------------------- | ------ |
| `MIMORII_WEB_PUSH_VAPID_PUBLIC_KEY`  | Generated `publicKey`                                | No     |
| `MIMORII_WEB_PUSH_VAPID_PRIVATE_KEY` | Generated `privateKey`                               | Yes    |
| `MIMORII_WEB_PUSH_VAPID_SUBJECT`     | `mailto:operations@example.com` or an HTTPS site URL | No     |

Keep this key pair stable. Changing it requires browsers to create new subscriptions. Production browser notifications require HTTPS, a valid certificate, and `/push-sw.js` served from the same public origin as the Mimorii interface. `localhost` is the browser development exception to HTTPS.

For a deployment at `https://mimorii.example.com`, also use:

```dotenv
MIMORII_PUBLIC_URL=https://mimorii.example.com
MIMORII_CORS_ORIGINS=https://mimorii.example.com,tauri://localhost,http://tauri.localhost
```

Replace the example hostname with the final user-facing domain. Its TLS certificate must be valid for that hostname and trusted by the browser and Android device. There is no separate VAPID domain allowlist.

Browser delivery does not use Firebase. Standard Web Push lets each browser use its own push service and only requires VAPID credentials on the Mimorii server.

## Android setup

The Android Client uses FCM because Android can receive FCM notifications while the application process is not running. The Client persists every Firebase Installation ID from `onRegistered`, including refreshed registrations, and uploads the current ID whenever an authenticated Client is active. It unregisters the installation when notifications are disabled or the user signs out. The server sends with the Firebase Admin SDK and Application Default Credentials. No legacy FCM server key or registration-token integration is used.

### 1. Create the Firebase application

1. In Firebase Console, create or select a project.
2. Open **Project settings → General → Your apps**, add an Android application, and use the exact package name `app.mimorii.monitor`.
3. In Google Cloud Console, open **APIs & Services → Library** and ensure **Firebase Cloud Messaging API** and **FCM Registration API** are enabled for the same project.
4. Download `google-services.json` for reference. Do not commit it. Mimorii initializes Firebase from build values and does not package this file.
5. Copy the values for the `app.mimorii.monitor` client:

| Mimorii build value               | `google-services.json` value            |
| --------------------------------- | --------------------------------------- |
| `MIMORII_FIREBASE_API_KEY`        | `client[].api_key[].current_key`        |
| `MIMORII_FIREBASE_APPLICATION_ID` | `client[].client_info.mobilesdk_app_id` |
| `MIMORII_FIREBASE_PROJECT_ID`     | `project_info.project_id`               |
| `MIMORII_FIREBASE_SENDER_ID`      | `project_info.project_number`           |

The matching client is the one whose `android_client_info.package_name` is `app.mimorii.monitor`.

For GitHub release APKs, create repository **Actions variables** with those four names. They are compiled into the Android Client, so they are identifiers rather than server credentials. In Google Cloud, restrict the API key to the Firebase Installations API and FCM Registration API. An Android application restriction can additionally require package `app.mimorii.monitor` and the SHA-1 fingerprint of the release signing certificate.

For a local Android build, set the same four environment variables in the shell that runs:

```bash
pnpm tauri:android:client:build
```

### 2. Authorize the Mimorii server

In Google Cloud Console, open **IAM & Admin → Service Accounts**, create a dedicated service account in the same project, and grant it **Firebase Cloud Messaging Admin** (`roles/firebasecloudmessaging.admin`). Download a JSON key only when the deployment cannot use Application Default Credentials through Workload Identity.

For a host installation, keep the JSON file outside the repository and set:

```dotenv
MIMORII_FIREBASE_PROJECT_ID=your-firebase-project-id
GOOGLE_APPLICATION_CREDENTIALS=/absolute/private/path/firebase-service-account.json
```

For Docker Compose, put the JSON key at the private host path selected by `MIMORII_FIREBASE_CREDENTIALS_FILE` and start with the secret overlay:

```dotenv
MIMORII_FIREBASE_PROJECT_ID=your-firebase-project-id
MIMORII_FIREBASE_CREDENTIALS_FILE=./secrets/firebase-service-account.json
```

```bash
docker compose -f compose.yaml -f compose.firebase.yaml up --build -d
```

The overlay mounts the key read-only as a Compose secret and sets `GOOGLE_APPLICATION_CREDENTIALS` inside the server container. Do not put the JSON content in `.env`, a container image, an Actions variable, or source control. On Google Cloud, prefer Workload Identity and omit the key file.

### 3. Keep Android signing stable

Production APK updates must use the same Android release keystore. If the Firebase API key has an Android application restriction, add that release certificate's SHA-1 fingerprint in Google Cloud. The existing release workflow reads signing material only from these GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Read the required SHA-1 fingerprint without exposing the private key:

```bash
keytool -list -v -keystore /private/path/release.keystore -alias your-key-alias
```

In Google Cloud Console, open **APIs & Services → Credentials**, edit the Firebase API key, select **Android apps**, and add package `app.mimorii.monitor` with that SHA-1 fingerprint. Keep the keystore and its passwords in an offline backup; changing the signing key prevents normal APK upgrades and invalidates that application restriction.

For a locally signed APK, add the SHA-1 fingerprint of the local signing certificate as a second Android application restriction for the same package. Remove that fingerprint when it is no longer used.

## Enable delivery

1. Sign in on the browser or Android Client.
2. Open **Account** and enable **This device**. Accept the notification permission prompt.
3. As a team owner or admin, open **Alerting**, then **Channels**, add **Browser and Android**, and select the users.
4. Open **Routing rules** and route the required events to that channel. Include **Check degraded** for threshold failures and **Incident opened** for outages.
5. Use **Test** on the channel. Delivery results appear in **Delivery history**.

Disabling **This device** or signing out unregisters that browser subscription or Android installation and removes it from the account. Provider responses for expired or revoked registrations also invalidate them automatically without interrupting monitoring.

## End-to-end tests

### Browser

1. Deploy Mimorii on its final HTTPS domain with VAPID values configured.
2. Sign in using a supported browser, enable **This device**, and grant permission.
3. Add a **Browser and Android** channel for the signed-in user and send a test.
4. Confirm a notification appears with Mimorii closed or in the background.
5. Select it and confirm Mimorii opens the relevant incident or resource.
6. Disable the device, send another test, and confirm no notification arrives.

### Android

1. Build and sign the Client APK with all four Firebase build values, then install it on an Android device or Google Play-enabled emulator.
2. Point the Client at the HTTPS Mimorii deployment, sign in, enable **This device**, and grant notification permission on Android 13 or newer.
3. Add the user to a **Browser and Android** channel and send a test while the Client is backgrounded.
4. Swipe the Client away and send another test. Confirm the notification still appears and opens its Mimorii destination.
5. Disable the device or sign out, send another test, and confirm delivery stops.
6. Trigger a real failed check or configured threshold, then a recovery, and confirm one notification for each state change.

## Platform limits

- Browser permission can only be requested from a user action. Private browsing, browser policy, operating-system focus modes, and disabled site notifications can suppress delivery.
- Web Push requires the deployed HTTPS origin. A subscription is tied to that origin and browser profile.
- Android delivery requires Google Play services and network access. Devices without Google Mobile Services are not supported by this FCM implementation.
- Android 13 and newer require notification permission. If it is denied, **Open settings** opens the application settings page.
- Android may delay normal-priority delivery. Force Stop prevents background delivery until the user opens or otherwise reactivates the application.
- Provider acceptance confirms that a message was handed to the push service, not that the operating system displayed it.
- Real background and closed-application behavior requires a browser and an Android device or emulator. Provider delivery requires production VAPID and Firebase credentials.
