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

## Monitor a private server

Create an agent in Mimorii and copy its enrollment key.

On Windows, install the MSI and run these commands from an administrator PowerShell terminal:

```bash
mimorii-agent-desktop enroll --server https://mimorii.example.com/api --key <enrollment-key>
mimorii-agent-desktop doctor
```

The installer starts the Windows service automatically. Enrollment is applied to the running
service without a restart.

The **Mimorii Agent** Start menu application provides status, enrollment, service controls, and
diagnostics through that same CLI and service.

On Linux, enroll and start the user service:

```bash
mimorii-agent-desktop enroll --server https://mimorii.example.com/api --key <enrollment-key>
mimorii-agent-desktop service install
mimorii-agent-desktop doctor
```

The agent sends host health and runs typed HTTP, TCP, and DNS checks. It cannot execute remote commands.

For a checks-only probe, Mimorii also provides a [Docker check runner](docs/agent-docker.md). It runs HTTP, TCP, DNS, ICMP, WAN, and database checks without reporting container or Docker VM telemetry as physical-host data. Use the native agent for host and Docker monitoring. Deployment requirements for ICMP, Docker, and database checks are in [Monitoring checks](docs/monitoring-checks.md); the resource and execution terminology is defined in [Monitoring model](docs/monitoring-model.md).

## Monitor an Android device

Add an Android device agent in the Mimorii Client and copy its enrollment code. Open the
separate Mimorii Agent application and paste the code to activate it. Android reports device status
on a best-effort WorkManager schedule. It does not run active monitoring checks. See
[Android applications](docs/android-apps.md) for permissions and platform limits.

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

## Native releases

Mimorii ships agents for Android, Ubuntu/Debian x64, and Windows x64, plus the web client packaged as a separate Android application. Release assets use stable filenames documented in [Release distribution](docs/release-distribution.md).

## Help

If something is not working, include the output of `docker compose ps` and the relevant log lines when opening a [GitHub issue](https://github.com/pureportal/mimorii/issues). Do not include secrets or enrollment keys.
