use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::time::Duration;

use anyhow::{Context, Result, bail};

use crate::target_policy::{TargetPolicy, TargetProtocol};

pub struct PingResult {
    pub sent: usize,
    pub received: usize,
    pub average_latency_ms: Option<f64>,
    pub minimum_latency_ms: Option<f64>,
    pub maximum_latency_ms: Option<f64>,
}

pub fn ping(
    host: &str,
    count: usize,
    timeout_ms: u64,
    policy: &TargetPolicy,
) -> Result<PingResult> {
    policy.authorize_host(TargetProtocol::Icmp, host)?;
    let addresses = (host, 0)
        .to_socket_addrs()
        .with_context(|| format!("DNS lookup failed for {host}"))?
        .collect::<Vec<SocketAddr>>();
    let authorized = policy.authorize_addresses(addresses)?;
    let address = authorized
        .first()
        .with_context(|| format!("DNS lookup failed for {host}"))?
        .ip();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    runtime.block_on(ping_async(address, count, timeout_ms))
}

async fn ping_async(address: IpAddr, count: usize, timeout_ms: u64) -> Result<PingResult> {
    if count == 0 || count > 10 {
        bail!("ICMP packet count is invalid");
    }
    let mut latencies = Vec::with_capacity(count);
    for _ in 0..count {
        if let Ok(Ok((_packet, latency))) = tokio::time::timeout(
            Duration::from_millis(timeout_ms),
            surge_ping::ping(address, &[0; 32]),
        )
        .await
        {
            latencies.push(latency.as_secs_f64() * 1_000.0);
        }
    }
    let average_latency_ms =
        (!latencies.is_empty()).then(|| latencies.iter().sum::<f64>() / latencies.len() as f64);
    Ok(PingResult {
        sent: count,
        received: latencies.len(),
        average_latency_ms,
        minimum_latency_ms: latencies.iter().copied().reduce(f64::min),
        maximum_latency_ms: latencies.iter().copied().reduce(f64::max),
    })
}
