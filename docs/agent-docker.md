# Docker check runner

The Docker image runs HTTP, TCP, and DNS checks only. It does not collect or submit host snapshots. Use the native Linux or Windows agent when Mimorii needs CPU, memory, load, disk, network, process, uptime, operating-system, or technology telemetry from the physical host.

## Run

Create a desktop agent in Mimorii and copy its enrollment key. Save the configuration in an ignored `.env.agent` file:

```dotenv
MIMORII_AGENT_SERVER=https://mimorii.example.com/api
MIMORII_AGENT_KEY=mim_agent_replace_with_the_enrollment_key
```

Run the published image. Authenticate to GHCR first when the package is private:

```bash
docker run -d --name mimorii-agent --restart unless-stopped --read-only --cap-drop ALL --security-opt no-new-privileges --env-file .env.agent ghcr.io/pureportal/mimorii-check-agent:latest
```

To build from a checkout instead:

```bash
docker compose --env-file .env.agent -f apps/agent-desktop/compose.yaml up --build -d
```

`MIMORII_AGENT_SERVER` and `MIMORII_AGENT_KEY` are required. HTTPS is required unless `MIMORII_AGENT_ALLOW_INSECURE_HTTP=true`; use HTTP only on a trusted private Docker network because the enrollment key authenticates every request.

Public check targets are allowed by default. To reach private check targets, add only the required networks:

```dotenv
MIMORII_AGENT_ALLOWED_CIDRS=10.20.0.0/16,172.30.0.0/24
```

## Container networking

- Checks originate from the container network. Target allowlists and firewalls must permit that source, and `localhost` refers to the container.
- On a user-defined Docker network, use service names. DNS checks use the resolver configured for the container.
- On Linux, host networking can make host-bound services reachable with `--network host`; allow `127.0.0.0/8` only when loopback checks are required.
- With Docker Desktop on Windows, use `host.docker.internal` for a service on Windows. Resolve it inside the running container with `docker exec mimorii-agent getent ahosts host.docker.internal`, allow only the required gateway address or subnet, and restart the container. The service must listen on a reachable interface and Windows Firewall must allow the connection.
- `host.docker.internal` is also available in the supplied Compose configuration on Linux. Set `MIMORII_AGENT_ALLOW_INSECURE_HTTP=true` when it is used to reach an HTTP-only local Mimorii server.

Docker Desktop checks run through its Linux VM. Neither Docker Desktop nor Linux Docker makes this image a physical-host telemetry agent.
