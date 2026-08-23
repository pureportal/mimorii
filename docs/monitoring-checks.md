# Monitoring checks

## ICMP and WAN

Direct checks use the operating system `ping` executable. The Mimorii server image includes `iputils-ping`. Bare-metal server installations must provide a compatible `ping` executable to the API process.

Desktop agents use ICMP sockets. Windows services have the required access. Native Linux installations need a kernel ping group range that includes the service user or `CAP_NET_RAW` on the agent executable. The Docker check runner adds only `NET_RAW` after dropping all capabilities.

Firewalls and hosts may intentionally reject ICMP. A rejected echo request is a valid down result; it does not imply that another protocol on the target is unavailable.

## Docker

Docker telemetry is collected through the local Docker Engine API. The native agent account needs read access to the engine socket. That access is security-sensitive because control of the Docker socket is generally equivalent to administrative access to the host; grant it only on machines where container monitoring is required.

The collector stores container state, health, restarts, CPU, memory, network and block I/O, image, Compose identity, published ports, and start time. Docker checks evaluate that collected state on the agent's own resource. The checks-only Docker image does not mount the Engine socket and therefore cannot report host or container telemetry.

## Databases

PostgreSQL and MySQL checks require a database name and username. Redis can use an optional username and numeric database index. Passwords and HTTP secret-header values are encrypted in check storage and are inserted only when an assigned task is polled or a direct check executes.

Create a dedicated monitoring account with only connection and statistics access plus `SELECT` on any explicitly configured assertion query. Do not use an administrative or application owner account. Custom PostgreSQL and MySQL assertions accept one `SELECT` or `SHOW` statement and execute in a read-only transaction, but database permissions remain the primary security boundary.

TLS validates the host trust chain and the configured hostname. Deploy a certificate whose subject names match that hostname. Private certificate authorities must be installed in the Mimorii server or desktop agent host trust store.

The collected database metrics are:

- PostgreSQL: version, connection utilization, database size, commits, rollbacks, cache hit rate, deadlocks, active slow queries, and replay lag.
- MySQL: version, connection utilization, questions, slow queries, aborted connections, network bytes, and uptime.
- Redis: version, clients, memory, cache hit rate, rejected connections, evictions, and uptime.

## References

- [ICMP Echo in RFC 792](https://www.rfc-editor.org/rfc/rfc792)
- [Linux ping socket and capability behavior](https://man7.org/linux/man-pages/man8/ping.8.html)
- [Docker Engine API](https://docs.docker.com/reference/api/engine/version/v1.46/)
- [PostgreSQL monitoring statistics](https://www.postgresql.org/docs/current/monitoring.html)
- [MySQL Performance Schema](https://dev.mysql.com/doc/refman/8.4/en/performance-schema.html)
