# Mimorii

[![CI](https://github.com/pureportal/mimorii/actions/workflows/ci.yml/badge.svg)](https://github.com/pureportal/mimorii/actions/workflows/ci.yml)
[![Release](https://github.com/pureportal/mimorii/actions/workflows/release.yml/badge.svg)](https://github.com/pureportal/mimorii/actions/workflows/release.yml)

![Mimorii monitoring websites, services, and servers](apps/client/public/art/mimorii-hero.png)

Mimorii is a self-hosted home for uptime, server health, incidents, and reliability. It watches public services directly and uses outbound-only agents for private networks, so you can see what is healthy without opening inbound access to your servers.

## What Mimorii watches

- Websites and APIs, including response status, timing, content assertions, and TLS certificate expiry
- TCP ports and DNS records
- CPU, memory, load, disks, and discovered server technologies
- Scheduled jobs and backups through heartbeat URLs
- Services inside private networks through Linux and Windows agents
- Android device availability, battery, memory, storage, connectivity, power, and thermal state

## From signal to response

Mimorii keeps check history and turns failures into an operational timeline. You can:

- investigate and update incidents in one place
- schedule recurring maintenance and suppress planned alerts
- route notifications by event, resource, severity, or team
- notify people by email, signed webhook, browser push, or Android push
- review delivery attempts and retry failures
- measure availability, latency, service goals, and error budgets
- share read-only dashboards and public status pages
- invite teammates with roles and keep an audit trail of important changes

## A typical workflow

1. Create a workspace.
2. Add a website, service, server, or scheduled job as a resource.
3. Add checks or a heartbeat and wait for the first result.
4. Create a notification channel, send a test, and choose which events it receives.
5. Review incidents and history from the resource page.
6. Publish a dashboard or status page when other people need visibility.

The built-in guide walks through each of these tasks from inside Mimorii.

## Start with Docker

You need Docker with Docker Compose.

Copy the example settings file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace these two values before starting:

- `MIMORII_DB_PASSWORD`
- `MIMORII_JWT_SECRET` with at least 32 random characters

Then start Mimorii:

```bash
docker compose up --build -d
```

Open [http://localhost:4310](http://localhost:4310), create your account, and add your first resource.

To see the current state or follow startup logs:

```bash
docker compose ps
docker compose logs -f mimorii
```

To stop Mimorii without deleting its data:

```bash
docker compose down
```

PostgreSQL data stays in a Docker volume. Back it up regularly, and do not use `docker compose down -v` unless you intend to delete it.

## Install an agent

### Windows

1. In Mimorii, create an agent and copy its enrollment key.
2. Download the [Windows x64 installer](https://github.com/pureportal/mimorii/releases/latest/download/mimorii-agent-windows-x64.msi).
3. Open the downloaded MSI and finish the installation.
4. Open **Mimorii Agent** from the Start menu.
5. Enter your Mimorii server URL and enrollment key, then select **Activate**.

### Linux

These commands install the agent on Ubuntu or Debian x64. Open a terminal and run:

```bash
sudo apt-get update
sudo apt-get install --yes curl
curl --fail --location https://github.com/pureportal/mimorii/releases/latest/download/mimorii-agent-ubuntu-debian-x64.tar.gz --output mimorii-agent.tar.gz
tar --extract --gzip --file mimorii-agent.tar.gz
sudo install --mode 0755 mimorii-agent-desktop /usr/local/bin/mimorii-agent-desktop
rm mimorii-agent.tar.gz mimorii-agent-desktop
```

In Mimorii, create an agent and copy its enrollment key. Replace the server URL and key below, then run:

```bash
mimorii-agent-desktop enroll --server https://YOUR-MIMORII-SERVER/api --key YOUR_ENROLLMENT_KEY
mimorii-agent-desktop doctor
```

Enrollment installs, enables, and immediately starts the agent's user service. It may request `sudo` once to keep the service running across logouts and reboots. When enrollment runs as root or via `sudo`, it uses root's configuration and user service. No Mimorii server restart is required.

The agent allows all network targets by default. On Windows, use **Network access** in the Mimorii Agent application to add optional IP, hostname, protocol, or port restrictions. On Linux, open the keyboard-driven configuration menu:

```bash
mimorii-agent-desktop config
```

Verify the service and inspect its logs with:

```bash
systemctl --user is-enabled mimorii-agent-desktop.service
systemctl --user is-active mimorii-agent-desktop.service
loginctl show-user "$USER" --property=Linger --value
journalctl --user --unit mimorii-agent-desktop.service --lines 50 --no-pager
```

The first two commands should print `enabled` and `active`; the linger setting should be `yes`. If enrollment completed but service setup failed, fix the reported issue and run `mimorii-agent-desktop service install`.

### Update the desktop agent

On Windows or Linux, check the latest stable GitHub release:

```bash
mimorii-agent-desktop update --check
```

Install it with:

```bash
mimorii-agent-desktop update
```

The Windows controls also show an install button when an update is available. On Linux, the
updater requests `sudo` only when the installed executable needs elevated write access.

### Android

Android 7.0 or newer is required.

1. Download and install the [Mimorii Client](https://github.com/pureportal/mimorii/releases/latest/download/mimorii-client-android.apk).
2. If Android blocks the APK, allow your browser or file manager to install unknown apps, then try again.
3. Open the Client and sign in to your Mimorii server.

To monitor the Android device itself, also install the [Mimorii Agent](https://github.com/pureportal/mimorii/releases/latest/download/mimorii-agent-android.apk). Add an Android device agent in the Client, copy its enrollment code, and paste the code into the Agent.

The desktop agent reports host health and runs HTTP, TCP, and DNS checks. It cannot execute remote commands. Android reports device status but does not run active monitoring checks. See [Android applications](docs/android-apps.md) for Android permissions and platform limits.

For a checks-only probe, Mimorii also provides a [Docker check runner](docs/agent-docker.md). Deployment requirements are in [Monitoring checks](docs/monitoring-checks.md).

## Monitor a scheduled job

Create a heartbeat for the job, then call the generated success URL when the work finishes:

```bash
curl -X POST https://mimorii.example.com/api/heartbeats/<token>
```

Mimorii also provides start and failure URLs for long-running jobs. A missed schedule or runtime deadline opens an incident automatically.

## Run Mimorii safely

- Put Mimorii behind HTTPS before exposing it to the internet or enrolling remote agents.
- Keep `.env`, database backups, agent keys, API tokens, and notification credentials private.
- Back up PostgreSQL and test that the backup can be restored.
- Keep the default single Mimorii application instance unless you provide external scheduler coordination.
- Review the privacy, email, analytics, and retention settings before opening a public deployment.

For optional email, analytics, retention, and advanced monitoring settings, use the values documented in [`.env.example`](.env.example). Browser and Android delivery setup is documented in [Notifications](docs/notifications.md).

## Help

If something is not working, include the output of `docker compose ps` and the relevant log lines when opening a [GitHub issue](https://github.com/pureportal/mimorii/issues). Do not include secrets or enrollment keys.
