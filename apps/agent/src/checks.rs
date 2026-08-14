use std::collections::BTreeMap;
use std::io::Read;
use std::net::{TcpStream, ToSocketAddrs};
use std::str::FromStr;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use hickory_resolver::Resolver;
use hickory_resolver::config::{ResolverConfig, ResolverOpts};
use hickory_resolver::proto::rr::RecordType;
use reqwest::Method;
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use serde::Deserialize;
use serde_json::{Value, json};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use url::Url;
use x509_parser::prelude::{FromDer, X509Certificate};

use crate::models::{AgentTask, CheckState, CheckType, HostSnapshot, TaskResult};
use crate::time_now;

const MAX_BODY_BYTES: u64 = 512 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpConfig {
    url: String,
    method: String,
    expected_statuses: Vec<u16>,
    response_contains: Option<String>,
    expected_headers: Option<BTreeMap<String, String>>,
    json_pointer: Option<String>,
    #[serde(default)]
    expected_json_value: Value,
    latency_warning_ms: Option<f64>,
    certificate_warning_days: Option<i64>,
    follow_redirects: bool,
    validate_tls: bool,
}

#[derive(Deserialize)]
struct TcpConfig {
    host: String,
    port: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DnsConfig {
    hostname: String,
    record_type: String,
    expected_value: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostConfig {
    cpu_warning_percent: f32,
    cpu_critical_percent: f32,
    memory_warning_percent: f64,
    memory_critical_percent: f64,
    load_warning: f64,
    load_critical: f64,
    swap_warning_percent: f64,
    swap_critical_percent: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskConfig {
    mount: String,
    warning_percent: f64,
    critical_percent: f64,
}

#[derive(Debug)]
struct CertificateMetrics {
    expires_at: String,
    days_remaining: i64,
    issuer: String,
}

fn certificate_metrics(der: &[u8]) -> Result<CertificateMetrics> {
    let (_, certificate) = X509Certificate::from_der(der)
        .map_err(|_| anyhow!("TLS certificate could not be inspected"))?;
    let expires_timestamp = certificate.validity().not_after.timestamp();
    let expires_at = OffsetDateTime::from_unix_timestamp(expires_timestamp)?.format(&Rfc3339)?;
    let days_remaining =
        (expires_timestamp - OffsetDateTime::now_utc().unix_timestamp()).div_euclid(86_400);
    Ok(CertificateMetrics {
        expires_at,
        days_remaining,
        issuer: certificate.issuer().to_string(),
    })
}

pub fn execute(task: &AgentTask, snapshot: &HostSnapshot) -> TaskResult {
    let result = match task.check_type {
        CheckType::Http => http(task),
        CheckType::Tcp => tcp(task),
        CheckType::Dns => dns(task),
        CheckType::Host => host(task, snapshot),
        CheckType::Disk => disk(task, snapshot),
    };
    result.unwrap_or_else(|error| down(&task.id, safe_error(&error), None, None, BTreeMap::new()))
}

fn http(task: &AgentTask) -> Result<TaskResult> {
    let config: HttpConfig =
        serde_json::from_value(task.config.clone()).context("HTTP configuration is invalid")?;
    if config.expected_statuses.is_empty() || config.expected_statuses.len() > 20 {
        bail!("HTTP expected status configuration is invalid");
    }
    let client = Client::builder()
        .timeout(Duration::from_millis(task.timeout_ms))
        .connect_timeout(Duration::from_millis(task.timeout_ms))
        .redirect(Policy::none())
        .danger_accept_invalid_certs(!config.validate_tls)
        .tls_info(true)
        .build()?;
    let mut url = Url::parse(&config.url)?;
    if url.scheme() != "http" && url.scheme() != "https" {
        bail!("HTTP URL is invalid");
    }
    if !url.username().is_empty() || url.password().is_some() {
        bail!("HTTP URL credentials are not allowed");
    }
    let method = Method::from_str(&config.method)?;
    if method != Method::GET && method != Method::HEAD {
        bail!("HTTP method is not allowed");
    }
    let started = Instant::now();
    for redirect in 0..=3 {
        let response = client
            .request(method.clone(), url.clone())
            .header(
                "user-agent",
                format!("mimorii-agent/{}", env!("CARGO_PKG_VERSION")),
            )
            .send()?;
        let status = response.status().as_u16();
        let server = response
            .headers()
            .get(reqwest::header::SERVER)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let powered_by = response
            .headers()
            .get("x-powered-by")
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let missing_expected_header = config.expected_headers.as_ref().and_then(|headers| {
            headers.iter().find_map(|(name, expected)| {
                let matches = response
                    .headers()
                    .get(name.as_str())
                    .and_then(|value| value.to_str().ok())
                    .is_some_and(|value| value.contains(expected));
                (!matches).then(|| name.clone())
            })
        });
        let certificate = response
            .extensions()
            .get::<reqwest::tls::TlsInfo>()
            .and_then(reqwest::tls::TlsInfo::peer_certificate)
            .map(certificate_metrics)
            .transpose()?;
        if config.follow_redirects && (300..400).contains(&status) {
            if redirect == 3 {
                return Ok(down(
                    &task.id,
                    "Too many redirects",
                    elapsed_ms(started),
                    Some(status),
                    BTreeMap::new(),
                ));
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .context("redirect location is invalid")?;
            url = url.join(location)?;
            if url.scheme() != "http" && url.scheme() != "https" {
                bail!("redirect protocol is not allowed");
            }
            continue;
        }
        let latency = elapsed_ms(started);
        let mut body = String::new();
        response.take(MAX_BODY_BYTES).read_to_string(&mut body)?;
        let mut metrics = BTreeMap::new();
        metrics.insert("responseBytes".to_owned(), json!(body.len()));
        if let Some(value) = server {
            metrics.insert("server".to_owned(), json!(value));
        }
        if let Some(value) = powered_by {
            metrics.insert("poweredBy".to_owned(), json!(value));
        }
        if let Some(value) = content_type {
            metrics.insert("contentType".to_owned(), json!(value));
        }
        if let Some(certificate) = certificate {
            metrics.insert(
                "certificateExpiresAt".to_owned(),
                json!(certificate.expires_at),
            );
            metrics.insert(
                "certificateDaysRemaining".to_owned(),
                json!(certificate.days_remaining),
            );
            metrics.insert("certificateIssuer".to_owned(), json!(certificate.issuer));
        }
        if !config.expected_statuses.contains(&status) {
            return Ok(down(
                &task.id,
                "Unexpected HTTP status",
                latency,
                Some(status),
                metrics,
            ));
        }
        if let Some(expected) = &config.response_contains
            && !body.contains(expected)
        {
            return Ok(down(
                &task.id,
                "Expected response content was not found",
                latency,
                Some(status),
                metrics,
            ));
        }
        if let Some(name) = missing_expected_header {
            return Ok(down(
                &task.id,
                format!("Expected response header {name} was not found"),
                latency,
                Some(status),
                metrics,
            ));
        }
        if let Some(pointer) = &config.json_pointer {
            let Ok(parsed) = serde_json::from_str::<Value>(&body) else {
                return Ok(down(
                    &task.id,
                    "Response is not valid JSON",
                    latency,
                    Some(status),
                    metrics,
                ));
            };
            let Some(actual) = parsed.pointer(pointer) else {
                return Ok(down(
                    &task.id,
                    "Expected JSON value was not found",
                    latency,
                    Some(status),
                    metrics,
                ));
            };
            if task.config.get("expectedJsonValue").is_some()
                && &config.expected_json_value != actual
            {
                return Ok(down(
                    &task.id,
                    "JSON value did not match",
                    latency,
                    Some(status),
                    metrics,
                ));
            }
        }
        let certificate_days = metrics
            .get("certificateDaysRemaining")
            .and_then(Value::as_i64);
        if config.certificate_warning_days.is_some()
            && certificate_days.is_some_and(|days| days <= 0)
        {
            return Ok(down(
                &task.id,
                "TLS certificate has expired",
                latency,
                Some(status),
                metrics,
            ));
        }
        let certificate_warning = config
            .certificate_warning_days
            .is_some_and(|warning| certificate_days.is_some_and(|days| days <= warning));
        let latency_warning = latency.is_some_and(|value| {
            value
                >= config
                    .latency_warning_ms
                    .unwrap_or(task.timeout_ms as f64 * 0.75)
        });
        let degraded = certificate_warning || latency_warning;
        return Ok(TaskResult {
            task_id: task.id.clone(),
            status: if degraded {
                CheckState::Degraded
            } else {
                CheckState::Up
            },
            latency_ms: latency,
            status_code: Some(status),
            message: certificate_warning
                .then(|| "TLS certificate is nearing expiration".to_owned())
                .or_else(|| {
                    latency_warning
                        .then(|| "Response latency exceeded the warning threshold".to_owned())
                }),
            metrics,
            checked_at: time_now(),
        });
    }
    bail!("HTTP check failed")
}

fn tcp(task: &AgentTask) -> Result<TaskResult> {
    let config: TcpConfig =
        serde_json::from_value(task.config.clone()).context("TCP configuration is invalid")?;
    let addresses = (config.host.as_str(), config.port).to_socket_addrs()?;
    let started = Instant::now();
    let timeout = Duration::from_millis(task.timeout_ms);
    let mut connected = false;
    for address in addresses {
        if TcpStream::connect_timeout(&address, timeout).is_ok() {
            connected = true;
            break;
        }
    }
    if !connected {
        return Ok(down(
            &task.id,
            "Connection failed",
            elapsed_ms(started),
            None,
            BTreeMap::new(),
        ));
    }
    let latency = elapsed_ms(started);
    Ok(tcp_success(&task.id, config.port, latency, task.timeout_ms))
}

fn tcp_success(task_id: &str, port: u16, latency: Option<f64>, timeout_ms: u64) -> TaskResult {
    let degraded = latency.is_some_and(|value| value >= timeout_ms as f64 * 0.75);
    let mut metrics = BTreeMap::new();
    metrics.insert("port".to_owned(), json!(port));
    TaskResult {
        task_id: task_id.to_owned(),
        status: if degraded {
            CheckState::Degraded
        } else {
            CheckState::Up
        },
        latency_ms: latency,
        status_code: None,
        message: degraded.then(|| "Connection is near the timeout".to_owned()),
        metrics,
        checked_at: time_now(),
    }
}

fn dns(task: &AgentTask) -> Result<TaskResult> {
    dns_with_config(task, ResolverConfig::default())
}

fn dns_with_config(task: &AgentTask, resolver_config: ResolverConfig) -> Result<TaskResult> {
    let config: DnsConfig =
        serde_json::from_value(task.config.clone()).context("DNS configuration is invalid")?;
    let record_type = RecordType::from_str(&config.record_type)
        .map_err(|_| anyhow!("DNS record type is invalid"))?;
    let mut options = ResolverOpts::default();
    options.timeout = Duration::from_millis(task.timeout_ms);
    options.attempts = 1;
    let resolver = Resolver::new(resolver_config, options)?;
    let started = Instant::now();
    let lookup = resolver.lookup(config.hostname.as_str(), record_type)?;
    let values: Vec<String> = lookup.iter().map(|record| record.to_string()).collect();
    let latency = elapsed_ms(started);
    let mut metrics = BTreeMap::new();
    metrics.insert("recordCount".to_owned(), json!(values.len()));
    if let Some(expected) = config.expected_value
        && !values.iter().any(|value| value.contains(&expected))
    {
        return Ok(down(
            &task.id,
            "Expected DNS value was not found",
            latency,
            None,
            metrics,
        ));
    }
    Ok(TaskResult {
        task_id: task.id.clone(),
        status: CheckState::Up,
        latency_ms: latency,
        status_code: None,
        message: None,
        metrics,
        checked_at: time_now(),
    })
}

fn host(task: &AgentTask, snapshot: &HostSnapshot) -> Result<TaskResult> {
    let config: HostConfig =
        serde_json::from_value(task.config.clone()).context("host configuration is invalid")?;
    let memory_percent = if snapshot.memory_total_bytes == 0 {
        0.0
    } else {
        snapshot.memory_used_bytes as f64 / snapshot.memory_total_bytes as f64 * 100.0
    };
    let swap_percent = if snapshot.swap_total_bytes == 0 {
        0.0
    } else {
        snapshot.swap_used_bytes as f64 / snapshot.swap_total_bytes as f64 * 100.0
    };
    let critical = snapshot.cpu_percent >= config.cpu_critical_percent
        || memory_percent >= config.memory_critical_percent
        || snapshot.load_average >= config.load_critical
        || swap_percent >= config.swap_critical_percent;
    let degraded = snapshot.cpu_percent >= config.cpu_warning_percent
        || memory_percent >= config.memory_warning_percent
        || snapshot.load_average >= config.load_warning
        || swap_percent >= config.swap_warning_percent;
    let mut metrics = BTreeMap::new();
    metrics.insert("cpuPercent".to_owned(), json!(snapshot.cpu_percent));
    metrics.insert("memoryPercent".to_owned(), json!(memory_percent));
    metrics.insert("loadAverage".to_owned(), json!(snapshot.load_average));
    metrics.insert("swapPercent".to_owned(), json!(swap_percent));
    metrics.insert("processCount".to_owned(), json!(snapshot.process_count));
    Ok(TaskResult {
        task_id: task.id.clone(),
        status: if critical {
            CheckState::Down
        } else if degraded {
            CheckState::Degraded
        } else {
            CheckState::Up
        },
        latency_ms: None,
        status_code: None,
        message: critical
            .then(|| "A host resource critical threshold was reached".to_owned())
            .or_else(|| {
                degraded.then(|| "A host resource warning threshold was reached".to_owned())
            }),
        metrics,
        checked_at: time_now(),
    })
}

fn disk(task: &AgentTask, snapshot: &HostSnapshot) -> Result<TaskResult> {
    let config: DiskConfig =
        serde_json::from_value(task.config.clone()).context("disk configuration is invalid")?;
    let disk = snapshot
        .disks
        .iter()
        .find(|disk| disk.mount.eq_ignore_ascii_case(&config.mount))
        .context("configured disk mount was not found")?;
    let used_percent = if disk.total_bytes == 0 {
        0.0
    } else {
        disk.used_bytes as f64 / disk.total_bytes as f64 * 100.0
    };
    let degraded = used_percent >= config.warning_percent;
    let critical = used_percent >= config.critical_percent;
    let mut metrics = BTreeMap::new();
    metrics.insert("usedPercent".to_owned(), json!(used_percent));
    metrics.insert("usedBytes".to_owned(), json!(disk.used_bytes));
    metrics.insert("totalBytes".to_owned(), json!(disk.total_bytes));
    Ok(TaskResult {
        task_id: task.id.clone(),
        status: if critical {
            CheckState::Down
        } else if degraded {
            CheckState::Degraded
        } else {
            CheckState::Up
        },
        latency_ms: None,
        status_code: None,
        message: critical
            .then(|| "Disk usage critical threshold was reached".to_owned())
            .or_else(|| degraded.then(|| "Disk usage warning threshold was reached".to_owned())),
        metrics,
        checked_at: time_now(),
    })
}

fn down(
    task_id: &str,
    message: impl Into<String>,
    latency_ms: Option<f64>,
    status_code: Option<u16>,
    metrics: BTreeMap<String, Value>,
) -> TaskResult {
    TaskResult {
        task_id: task_id.to_owned(),
        status: CheckState::Down,
        latency_ms,
        status_code,
        message: Some(message.into()),
        metrics,
        checked_at: time_now(),
    }
}

fn elapsed_ms(started: Instant) -> Option<f64> {
    Some((started.elapsed().as_secs_f64() * 1000.0 * 10.0).round() / 10.0)
}

fn safe_error(error: &anyhow::Error) -> String {
    let message = error.to_string();
    let details = error
        .chain()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    if details.contains("configuration") || details.contains("not allowed") {
        message
    } else if details.contains("timed out") || details.contains("timeout") {
        "Check timed out".to_owned()
    } else if details.contains("dns") || details.contains("resolve") {
        "Target could not be resolved".to_owned()
    } else if details.contains("certificate") || details.contains("tls") {
        "TLS validation failed".to_owned()
    } else {
        "Connection failed".to_owned()
    }
}

#[cfg(test)]
#[path = "checks_tests/mod.rs"]
mod tests;
