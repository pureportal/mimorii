# Monitoring model

## Terminology

A **resource** is an entity whose health or telemetry is monitored. Hosts, Android devices, and services are resources. A resource has identity, ownership, tags, status, incidents, telemetry, alerts, and checks; it does not contain a network address or execution route.

An **agent** is a collector and check executor installed on one resource. Its identity, enrollment credential, capabilities, platform, collection interval, and last contact belong to the agent. Every agent has exactly one resource, so the machine or device running it remains visible and monitorable even when it executes checks for other resources.

A **check** is an observation performed on behalf of one resource. It owns its schedule, thresholds, assertions, target configuration, current state, result history, and execution route. A check runs directly from the API or through one desktop agent.

A **target** is the protocol-specific destination inside a check configuration. HTTP URLs, TCP hosts and ports, DNS names, ICMP hosts, WAN peers, and database endpoints are targets. Targets are value objects, not independently managed records.

The canonical relationships are:

```text
Resource 1 ── 0..1 Agent
Resource 1 ── 0..* Check
Check    1 ── 1 Target/configuration
Check    1 ── 1 Execution route (direct or desktop Agent)
Resource 1 ── 0..* Alert condition
```

Host, disk, and Docker checks observe the agent's own resource. Network and database checks can observe any resource and can run directly or through a desktop agent. Android agents collect only their own device telemetry.

Creating a desktop agent also creates a Host Health check and a Disk Usage check for the primary volume (`/` on Linux or `C:` on Windows). Host Health evaluates CPU, memory, load, and swap and is the only check that enables raw host snapshot reporting. Disk Usage and Docker checks evaluate a local snapshot and return only their check metrics.

## Rationale

OpenTelemetry models a Resource as the entity producing telemetry and allows entity identity to be associated with that resource. Prometheus separates a monitored instance from the scrape job that observes it. Zabbix similarly separates hosts from items and item execution types. These systems consistently distinguish the monitored entity from the observation and its collection mechanism.

The previous model stored a generic target and agent assignment on the resource. That made a website act simultaneously as an entity, a destination, and an execution plan; it also prevented checks for one resource from using different routes. The canonical model keeps entity identity stable while allowing each observation to select the appropriate target and executor.

## Android relay feasibility

Reliable desktop-agent relay semantics are not feasible for the Android Agent. Mimorii checks can run every 30 seconds and expect prompt polling and result return. Android WorkManager has a 15-minute minimum periodic interval and its execution is inexact. Doze and App Standby defer network access and jobs, background restrictions and quotas add further delay, and Force Stop prevents background restart until the user interacts with the application. A continuous foreground service would require a persistent user-visible notification, is subject to Play policy eligibility, cannot provide uninterrupted execution after Force Stop, and has additional Android 15 start and runtime limits.

The Android Agent therefore remains a device-telemetry collector with 15-to-60-minute deferrable work. It is not advertised as a check executor and cannot be selected as a check route. Manual collection remains available. Users who need checks from an Android network can run the desktop agent on an always-on machine in that network. Alert conditions are evaluated from Android telemetry by the API and delivered to the separate Client APK through its push channel.

## References

- [OpenTelemetry resources and entities](https://opentelemetry.io/docs/specs/semconv/how-to-write-conventions/resource-and-entities/)
- [Prometheus jobs and instances](https://prometheus.io/docs/concepts/jobs_instances/)
- [Zabbix definitions](https://www.zabbix.com/documentation/current/en/manual/definitions)
- [Zabbix item types](https://www.zabbix.com/documentation/current/en/manual/config/items/itemtypes)
- [Android periodic work](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)
- [Android Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
- [Android 15 behavior changes](https://developer.android.com/about/versions/15/behavior-changes-15)
- [Google Play foreground service requirements](https://support.google.com/googleplay/android-developer/answer/16559646)
