use anyhow::{Context, Result};
use bollard::Docker;
use bollard::query_parameters::{ListContainersOptionsBuilder, StatsOptionsBuilder};
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;

use crate::models::{ContainerRuntimeSnapshot, ContainerSnapshot};

pub fn collect() -> Option<ContainerRuntimeSnapshot> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .ok()?;
    runtime.block_on(collect_async()).ok()
}

async fn collect_async() -> Result<ContainerRuntimeSnapshot> {
    let docker = Docker::connect_with_local_defaults().context("Docker is unavailable")?;
    let version = json(docker.version().await?)?;
    let summaries = docker
        .list_containers(Some(
            ListContainersOptionsBuilder::default().all(true).build(),
        ))
        .await?;
    let mut containers = Vec::with_capacity(summaries.len());
    for summary in summaries {
        let summary = json(summary)?;
        let Some(id) = string(&summary, "/id") else {
            continue;
        };
        let inspect = json(docker.inspect_container(&id, None).await?)?;
        let stats = if string(&summary, "/state").as_deref() == Some("running") {
            docker
                .stats(
                    &id,
                    Some(
                        StatsOptionsBuilder::default()
                            .stream(false)
                            .one_shot(true)
                            .build(),
                    ),
                )
                .next()
                .await
                .transpose()?
                .map(json)
                .transpose()?
                .unwrap_or(Value::Null)
        } else {
            Value::Null
        };
        containers.push(container(id, &summary, &inspect, &stats));
    }
    containers.sort_by_key(|container| container.name.to_lowercase());
    Ok(ContainerRuntimeSnapshot {
        engine_version: string(&version, "/version").unwrap_or_else(|| "unknown".to_owned()),
        containers,
    })
}

fn container(id: String, summary: &Value, inspect: &Value, stats: &Value) -> ContainerSnapshot {
    let labels = summary.pointer("/labels").and_then(Value::as_object);
    let cpu_delta = number(stats, "/cpu_stats/cpu_usage/total_usage")
        .saturating_sub(number(stats, "/precpu_stats/cpu_usage/total_usage"));
    let system_delta = number(stats, "/cpu_stats/system_cpu_usage")
        .saturating_sub(number(stats, "/precpu_stats/system_cpu_usage"));
    let online_cpus = number(stats, "/cpu_stats/online_cpus").max(1);
    let cpu_percent = if system_delta == 0 {
        0.0
    } else {
        cpu_delta as f64 / system_delta as f64 * online_cpus as f64 * 100.0
    };
    let (network_received_bytes, network_transmitted_bytes) = stats
        .pointer("/networks")
        .and_then(Value::as_object)
        .map(|networks| {
            networks
                .values()
                .fold((0, 0), |(received, transmitted), network| {
                    (
                        received + number(network, "/rx_bytes"),
                        transmitted + number(network, "/tx_bytes"),
                    )
                })
        })
        .unwrap_or((0, 0));
    let (block_read_bytes, block_written_bytes) = stats
        .pointer("/blkio_stats/io_service_bytes_recursive")
        .and_then(Value::as_array)
        .map(|entries| {
            entries.iter().fold((0, 0), |(read, written), entry| {
                let value = number(entry, "/value");
                match string(entry, "/op")
                    .as_deref()
                    .map(str::to_ascii_lowercase)
                    .as_deref()
                {
                    Some("read") => (read + value, written),
                    Some("write") => (read, written + value),
                    _ => (read, written),
                }
            })
        })
        .unwrap_or((0, 0));
    ContainerSnapshot {
        id,
        name: summary
            .pointer("/names/0")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .trim_start_matches('/')
            .to_owned(),
        image: string(summary, "/image").unwrap_or_else(|| "unknown".to_owned()),
        state: normalized_state(string(summary, "/state").as_deref()),
        health: normalized_health(string(inspect, "/state/health/status").as_deref()),
        restart_count: number(inspect, "/restart_count"),
        cpu_percent,
        memory_used_bytes: number(stats, "/memory_stats/usage"),
        memory_limit_bytes: number(stats, "/memory_stats/limit"),
        network_received_bytes,
        network_transmitted_bytes,
        block_read_bytes,
        block_written_bytes,
        compose_project: label(labels, "com.docker.compose.project"),
        compose_service: label(labels, "com.docker.compose.service"),
        ports: ports(summary),
        started_at: string(inspect, "/state/started_at")
            .filter(|value| !value.starts_with("0001-")),
    }
}

fn ports(value: &Value) -> Vec<String> {
    value
        .pointer("/ports")
        .and_then(Value::as_array)
        .map(|ports| {
            ports
                .iter()
                .filter_map(|port| {
                    let private = number(port, "/private_port");
                    (private > 0).then(|| {
                        let protocol = string(port, "/type").unwrap_or_else(|| "tcp".to_owned());
                        match number(port, "/public_port") {
                            0 => format!("{private}/{protocol}"),
                            public => format!("{public}:{private}/{protocol}"),
                        }
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn normalized_state(value: Option<&str>) -> String {
    match value {
        Some("created" | "running" | "paused" | "restarting" | "exited" | "dead") => {
            value.unwrap().to_owned()
        }
        _ => "unknown".to_owned(),
    }
}

fn normalized_health(value: Option<&str>) -> String {
    match value {
        Some("healthy" | "unhealthy" | "starting") => value.unwrap().to_owned(),
        _ => "none".to_owned(),
    }
}

fn label(labels: Option<&serde_json::Map<String, Value>>, key: &str) -> Option<String> {
    labels?.get(key)?.as_str().map(str::to_owned)
}

fn string(value: &Value, pointer: &str) -> Option<String> {
    value.pointer(pointer)?.as_str().map(str::to_owned)
}

fn number(value: &Value, pointer: &str) -> u64 {
    value.pointer(pointer).and_then(Value::as_u64).unwrap_or(0)
}

fn json(value: impl Serialize) -> Result<Value> {
    Ok(serde_json::to_value(value)?)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn maps_docker_state_stats_labels_ports_and_io() {
        let summary = json!({
            "names": ["/api"],
            "image": "example/api:1",
            "state": "running",
            "labels": {
                "com.docker.compose.project": "platform",
                "com.docker.compose.service": "api"
            },
            "ports": [{ "private_port": 8080, "public_port": 80, "type": "tcp" }]
        });
        let inspect = json!({
            "restart_count": 2,
            "state": { "health": { "status": "healthy" }, "started_at": "2026-08-23T10:00:00Z" }
        });
        let stats = json!({
            "cpu_stats": { "cpu_usage": { "total_usage": 300 }, "system_cpu_usage": 1000, "online_cpus": 2 },
            "precpu_stats": { "cpu_usage": { "total_usage": 100 }, "system_cpu_usage": 500 },
            "memory_stats": { "usage": 50, "limit": 100 },
            "networks": { "eth0": { "rx_bytes": 10, "tx_bytes": 20 } },
            "blkio_stats": { "io_service_bytes_recursive": [
                { "op": "Read", "value": 30 }, { "op": "Write", "value": 40 }
            ] }
        });

        let value = super::container("container-1".to_owned(), &summary, &inspect, &stats);

        assert_eq!(value.name, "api");
        assert_eq!(value.health, "healthy");
        assert_eq!(value.cpu_percent, 80.0);
        assert_eq!(value.network_received_bytes, 10);
        assert_eq!(value.block_written_bytes, 40);
        assert_eq!(value.compose_project.as_deref(), Some("platform"));
        assert_eq!(value.ports, vec!["80:8080/tcp"]);
    }
}
