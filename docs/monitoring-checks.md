# Monitoring checks

## Alert confirmation

A check alerts only after its configured number of consecutive breached evaluations. A healthy evaluation before confirmation resets the count without sending an alert or recovery notification. Set **Consecutive breaches before alert** to `1` for immediate alerting.

## ICMP and WAN

Direct checks use the operating system `ping` executable. The Mimorii server image includes `iputils-ping`. Bare-metal server installations must provide a compatible `ping` executable to the API process.

Desktop agents use ICMP sockets. Windows services have the required access. Native Linux installations need a kernel ping group range that includes the service user or `CAP_NET_RAW` on the agent executable. The Docker check runner adds only `NET_RAW` after dropping all capabilities.

Firewalls and hosts may intentionally reject ICMP. A rejected echo request is a valid down result; it does not imply that another protocol on the target is unavailable.

## Host maintenance

Native Windows and Linux agents assess host maintenance when a Host health check runs. Findings appear alongside resource metrics in check details and use the existing Okay, Warning, and Critical health states. An enabled assessment with missing, stale, inaccessible, or timed-out data reports **Unavailable** and makes the host check at least Warning. Known critical findings remain Critical when another assessment is unavailable.

All maintenance checks are enabled by default, including when `maintenance` is omitted from a host configuration. Security updates become Critical at one pending update; software updates and failed services become Warning at one. Required restarts are Warning. Detected security problems are Critical. Update data may be at most 72 hours old. New host checks use a 30-second timeout. Existing checks retain their configured timeout.

Configure these settings in the Host health form or its `maintenance` configuration object:

| Setting                                                                              | Default | Accepted values    |
| ------------------------------------------------------------------------------------ | ------- | ------------------ |
| `securityUpdates`, `softwareUpdates`, `rebootRequired`, `security`, `failedServices` | `true`  | Boolean            |
| `securityUpdateCriticalCount`                                                        | `1`     | Integer, 1–100,000 |
| `softwareUpdateWarningCount`                                                         | `1`     | Integer, 1–100,000 |
| `failedServiceWarningCount`                                                          | `1`     | Integer, 1–100,000 |
| `maxUpdateAgeHours`                                                                  | `72`    | Integer, 1–8,760   |

Disabled checks do not collect or report their assessment. Threshold changes apply on the next run. Counts include all detected items; details name up to five examples. Package and update searches use local metadata without refreshing repositories, downloading updates, installing software, restarting services, or changing security settings.

### Windows

The agent uses an [offline Windows Update search](https://learn.microsoft.com/en-us/windows/win32/api/wuapi/nf-wuapi-iupdatesearcher-get_online) for pending software updates, including hidden updates. Security and Critical Updates categories, plus updates marked with critical MSRC severity, contribute to the security count. Freshness uses Windows Update's [last successful automatic search](https://learn.microsoft.com/en-us/windows/win32/api/wuapi/nf-wuapi-iautomaticupdatesresults-get_lastsearchsuccessdate). Missing search history cannot establish freshness. Slow or disabled Windows Update services can leave this assessment unavailable.

Restart detection uses Windows Update's restart state and the Component Based Servicing restart marker. Security assessment checks Windows Firewall's active profiles and Microsoft Defender's real-time protection. Third-party antivirus is not assessed; passive or inaccessible Defender data is unavailable. Failed services are automatically started services that are stopped with a nonzero exit code; intentionally stopped services without an error are excluded. Windows PowerShell and access to these OS data sources are required.

### Linux

Update assessment supports Debian and Ubuntu APT hosts with `/usr/bin/python3` and `python3-apt`. It compares installed versions with newer versions in trusted local repository indexes using [APT's package data and version comparison](https://apt-team.pages.debian.net/python-apt/library/apt_pkg.html). Held and pinned packages are included. Security classification uses Debian and Ubuntu security origins, including a newer security version superseded by a later regular update. A missing security repository leaves security classification unavailable.

Untrusted repositories, expired repository metadata, and configured indexes that a repository publishes but that are missing locally prevent a successful update assessment. Indexes APT intentionally skips, such as empty components, architectures a repository does not publish, and base indexes replaced by enabled architecture variants like amd64v3, do not count as missing. Freshness uses the oldest configured repository metadata's local change time, or a more recent APT success stamp. Without a success stamp, unchanged repository metadata can conservatively appear stale after a refresh. Refresh metadata through the host's package management process; Mimorii does not do so.

Restart assessment uses `/run/reboot-required`; an absent marker is only a successful assessment when its `update-notifier` provider is installed. Security assessment reads the [kernel's CPU vulnerability reports](https://www.kernel.org/doc/html/latest/admin-guide/hw-vuln/mds.html), including partially mitigated reports that still say vulnerable. Failed service assessment requires systemd. Other package managers, Linux firewall configurations, and Linux antivirus are not assessed.

These checks cover the host's configured update sources and OS reports. They do not provide a universal software inventory, CVE scan, upstream latest-version comparison, or OS end-of-support determination. Manually installed software and updates outside those sources are not covered. Docker check runners and mobile agents do not assess host maintenance.

Collector fixtures can be verified with `cargo test --manifest-path apps/agent-desktop/Cargo.toml`, `python -B apps/agent-desktop/src/host_maintenance/apt_tests.py`, and, on Windows, `powershell -NoProfile -NonInteractive -File apps/agent-desktop/src/host_maintenance/windows_tests.ps1`.

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
