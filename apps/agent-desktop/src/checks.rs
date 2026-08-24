use std::collections::BTreeMap;
use std::io::Read;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::str::FromStr;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
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

use crate::database::{self, DatabaseConfig};
use crate::favicon;
use crate::icmp;
use crate::models::{AgentTask, CheckState, CheckType, FaviconResult, HostSnapshot, TaskResult};
use crate::target_policy::{TargetPolicy, TargetProtocol};
use crate::time_now;

const MAX_BODY_BYTES: u64 = 512 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpConfig {
    target: HttpTarget,
    expected_statuses: Vec<u16>,
    response_contains: Option<String>,
    expected_headers: Option<BTreeMap<String, String>>,
    json_assertions: Option<JsonAssertionGroup>,
    latency_warning_ms: Option<f64>,
    certificate_warning_days: Option<i64>,
    follow_redirects: bool,
    validate_tls: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpTarget {
    url: String,
    method: String,
    headers: Option<BTreeMap<String, String>>,
    secret_header_name: Option<String>,
    body: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum JsonAssertionNode {
    Assertion {
        name: String,
        pointer: String,
        operator: JsonAssertionOperator,
        #[serde(rename = "expectedValue", default)]
        expected_value: Value,
    },
    Group {
        operator: JsonGroupOperator,
        conditions: Vec<JsonAssertionNode>,
    },
}

#[derive(Deserialize)]
struct JsonAssertionGroup {
    operator: JsonGroupOperator,
    conditions: Vec<JsonAssertionNode>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum JsonAssertionOperator {
    Equals,
    NotEquals,
    Contains,
    Exists,
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum JsonGroupOperator {
    And,
    Or,
}

#[derive(Deserialize)]
struct TcpConfig {
    target: TcpTarget,
}

#[derive(Deserialize)]
struct TcpTarget {
    host: String,
    port: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DnsConfig {
    target: DnsTarget,
    record_type: String,
    expected_value: Option<String>,
}

#[derive(Deserialize)]
struct DnsTarget {
    hostname: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IcmpConfig {
    target: IcmpTarget,
    packet_count: usize,
    minimum_success_percent: f64,
    latency_warning_ms: Option<f64>,
}

#[derive(Deserialize)]
struct IcmpTarget {
    host: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WanConfig {
    targets: Vec<WanTarget>,
    required_successful_targets: usize,
    packet_count: usize,
    latency_warning_ms: Option<f64>,
}

#[derive(Deserialize)]
struct WanTarget {
    name: String,
    host: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostConfig {
    cpu_warning_percent: f32,
    cpu_critical_percent: f32,
    memory_warning_percent: f64,
    memory_critical_percent: f64,
    load_warning: Option<f64>,
    load_critical: Option<f64>,
    swap_warning_percent: f64,
    swap_critical_percent: f64,
    storage: Vec<StorageConfig>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageConfig {
    mount: String,
    warning_percent: f64,
    critical_percent: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DockerConfig {
    container_name_pattern: Option<String>,
    require_healthy: bool,
    require_running: bool,
    maximum_restarts: u64,
    cpu_warning_percent: f64,
    memory_warning_percent: f64,
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

pub fn execute(
    task: &AgentTask,
    snapshot: &HostSnapshot,
    target_policy: &TargetPolicy,
) -> TaskResult {
    let result = match task.check_type {
        CheckType::Http => http(task, target_policy),
        CheckType::Tcp => tcp(task, target_policy),
        CheckType::Dns => dns(task),
        CheckType::Icmp => icmp_check(task, target_policy),
        CheckType::Wan => wan(task, target_policy),
        CheckType::Host => host(task, snapshot),
        CheckType::Docker => docker(task, snapshot),
        CheckType::Database => database_check(task, target_policy),
    };
    with_favicon(task, target_policy, result_or_down(task, result))
}

pub fn execute_network(task: &AgentTask, target_policy: &TargetPolicy) -> Result<TaskResult> {
    let result = match task.check_type {
        CheckType::Http => http(task, target_policy),
        CheckType::Tcp => tcp(task, target_policy),
        CheckType::Dns => dns(task),
        CheckType::Icmp => icmp_check(task, target_policy),
        CheckType::Wan => wan(task, target_policy),
        CheckType::Database => database_check(task, target_policy),
        CheckType::Host | CheckType::Docker => {
            bail!("check runner received an unsupported host telemetry task")
        }
    };
    Ok(with_favicon(
        task,
        target_policy,
        result_or_down(task, result),
    ))
}

fn with_favicon(
    task: &AgentTask,
    target_policy: &TargetPolicy,
    mut result: TaskResult,
) -> TaskResult {
    let Some(request_id) = task.favicon_request_id.as_ref() else {
        return result;
    };
    let favicon = task
        .config
        .pointer("/target/url")
        .and_then(Value::as_str)
        .context("Favicon URL is unavailable")
        .and_then(|url| favicon::retrieve(url, task.timeout_ms, target_policy));
    result.favicon = Some(match favicon {
        Ok(data) => FaviconResult::Retrieved {
            request_id: request_id.clone(),
            data_base64: BASE64.encode(data),
        },
        Err(error) => FaviconResult::Failed {
            request_id: request_id.clone(),
            message: truncate(&error.to_string(), 500),
        },
    });
    result
}

fn result_or_down(task: &AgentTask, result: Result<TaskResult>) -> TaskResult {
    result.unwrap_or_else(|error| down(&task.id, safe_error(&error), None, None, BTreeMap::new()))
}

fn http(task: &AgentTask, target_policy: &TargetPolicy) -> Result<TaskResult> {
    http_with_resolver(task, target_policy, resolve_addresses)
}

fn http_with_resolver(
    task: &AgentTask,
    target_policy: &TargetPolicy,
    resolve: impl Fn(&str, u16) -> Result<Vec<SocketAddr>>,
) -> Result<TaskResult> {
    let config: HttpConfig =
        serde_json::from_value(task.config.clone()).context("HTTP configuration is invalid")?;
    if config.target.secret_header_name.is_some() != task.secret.is_some() {
        bail!("HTTP secret header configuration is invalid");
    }
    if config.expected_statuses.is_empty() || config.expected_statuses.len() > 20 {
        bail!("HTTP expected status configuration is invalid");
    }
    let mut url = Url::parse(&config.target.url)?;
    let method = Method::from_str(&config.target.method)?;
    if ![
        Method::GET,
        Method::HEAD,
        Method::POST,
        Method::PUT,
        Method::PATCH,
        Method::DELETE,
        Method::OPTIONS,
    ]
    .contains(&method)
    {
        bail!("HTTP method is not allowed");
    }
    let started = Instant::now();
    let mut send_secret = true;
    for redirect in 0..=3 {
        let (protocol, hostname, port) = http_target(&url)?;
        target_policy.authorize_request(protocol, hostname, port)?;
        let addresses = target_policy.authorize_addresses(resolve(hostname, port)?)?;
        let mut client = Client::builder()
            .timeout(Duration::from_millis(task.timeout_ms))
            .connect_timeout(Duration::from_millis(task.timeout_ms))
            .no_proxy()
            .redirect(Policy::none())
            .danger_accept_invalid_certs(!config.validate_tls)
            .tls_info(true);
        if matches!(url.host(), Some(url::Host::Domain(_))) {
            client = client.resolve_to_addrs(hostname, &addresses);
        }
        let client = client.build()?;
        let mut request = client.request(method.clone(), url.clone()).header(
            "user-agent",
            format!("mimorii-agent-desktop/{}", env!("CARGO_PKG_VERSION")),
        );
        if let Some(headers) = &config.target.headers {
            for (name, value) in headers {
                if name.eq_ignore_ascii_case("authorization") {
                    bail!("HTTP authorization must use the encrypted secret header");
                }
                request = request.header(name, value);
            }
        }
        if send_secret
            && let (Some(name), Some(value)) =
                (&config.target.secret_header_name, task.secret.as_deref())
        {
            request = request.header(name, value);
        }
        if let Some(body) = &config.target.body {
            request = request.body(body.clone());
        }
        let response = request.send()?;
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
            let next_url = url.join(location)?;
            if next_url.scheme() != "http" && next_url.scheme() != "https" {
                bail!("redirect protocol is not allowed");
            }
            send_secret &= next_url.origin() == url.origin();
            url = next_url;
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
        if let Some(assertions) = &config.json_assertions {
            let Ok(parsed) = serde_json::from_str::<Value>(&body) else {
                return Ok(down(
                    &task.id,
                    "Response is not valid JSON",
                    latency,
                    Some(status),
                    metrics,
                ));
            };
            if let Err(name) = evaluate_json_group(assertions, &parsed) {
                return Ok(down(
                    &task.id,
                    format!("JSON assertion failed: {name}"),
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
            favicon: None,
        });
    }
    bail!("HTTP check failed")
}

fn http_target(url: &Url) -> Result<(TargetProtocol, &str, u16)> {
    let protocol = match url.scheme() {
        "http" => TargetProtocol::Http,
        "https" => TargetProtocol::Https,
        _ => bail!("HTTP URL is invalid"),
    };
    if !url.username().is_empty() || url.password().is_some() {
        bail!("HTTP URL credentials are not allowed");
    }
    let hostname = url.host_str().context("HTTP URL host is invalid")?;
    let port = url
        .port_or_known_default()
        .context("HTTP URL port is invalid")?;
    Ok((protocol, hostname, port))
}

fn evaluate_json_group(group: &JsonAssertionGroup, document: &Value) -> Result<(), String> {
    evaluate_json_nodes(group.operator, &group.conditions, document)
}

fn evaluate_json_nodes(
    operator: JsonGroupOperator,
    conditions: &[JsonAssertionNode],
    document: &Value,
) -> Result<(), String> {
    let results = conditions
        .iter()
        .map(|condition| evaluate_json_node(condition, document))
        .collect::<Vec<_>>();
    match operator {
        JsonGroupOperator::And => results.into_iter().find(Result::is_err).unwrap_or(Ok(())),
        JsonGroupOperator::Or => {
            if results.iter().any(Result::is_ok) {
                Ok(())
            } else {
                results
                    .into_iter()
                    .find_map(Result::err)
                    .map_or(Ok(()), Err)
            }
        }
    }
}

fn evaluate_json_node(node: &JsonAssertionNode, document: &Value) -> Result<(), String> {
    match node {
        JsonAssertionNode::Group {
            operator,
            conditions,
        } => evaluate_json_nodes(*operator, conditions, document),
        JsonAssertionNode::Assertion {
            name,
            pointer,
            operator,
            expected_value,
        } => {
            let actual = document.pointer(pointer);
            let matches = match operator {
                JsonAssertionOperator::Exists => actual.is_some(),
                JsonAssertionOperator::Equals => actual == Some(expected_value),
                JsonAssertionOperator::NotEquals => {
                    actual.is_some_and(|value| value != expected_value)
                }
                JsonAssertionOperator::Contains => {
                    actual.is_some_and(|value| json_contains(value, expected_value))
                }
                JsonAssertionOperator::GreaterThan => {
                    json_number(actual) > json_number(Some(expected_value))
                }
                JsonAssertionOperator::GreaterThanOrEqual => {
                    json_number(actual) >= json_number(Some(expected_value))
                }
                JsonAssertionOperator::LessThan => {
                    json_number(actual) < json_number(Some(expected_value))
                }
                JsonAssertionOperator::LessThanOrEqual => {
                    json_number(actual) <= json_number(Some(expected_value))
                }
            };
            if matches { Ok(()) } else { Err(name.clone()) }
        }
    }
}

fn json_contains(actual: &Value, expected: &Value) -> bool {
    match (actual, expected) {
        (Value::String(actual), Value::String(expected)) => actual.contains(expected),
        (Value::Array(actual), expected) => actual.contains(expected),
        _ => false,
    }
}

fn json_number(value: Option<&Value>) -> f64 {
    value.and_then(Value::as_f64).unwrap_or(f64::NAN)
}

fn tcp(task: &AgentTask, target_policy: &TargetPolicy) -> Result<TaskResult> {
    tcp_with_resolver(task, target_policy, resolve_addresses)
}

fn tcp_with_resolver(
    task: &AgentTask,
    target_policy: &TargetPolicy,
    resolve: impl Fn(&str, u16) -> Result<Vec<SocketAddr>>,
) -> Result<TaskResult> {
    let config: TcpConfig =
        serde_json::from_value(task.config.clone()).context("TCP configuration is invalid")?;
    target_policy.authorize_request(
        TargetProtocol::Tcp,
        &config.target.host,
        config.target.port,
    )?;
    let addresses =
        target_policy.authorize_addresses(resolve(&config.target.host, config.target.port)?)?;
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
    Ok(tcp_success(
        &task.id,
        config.target.port,
        latency,
        task.timeout_ms,
    ))
}

fn resolve_addresses(hostname: &str, port: u16) -> Result<Vec<SocketAddr>> {
    (hostname, port)
        .to_socket_addrs()
        .with_context(|| format!("DNS lookup failed for {hostname}"))
        .map(Iterator::collect)
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
        favicon: None,
    }
}

fn dns(task: &AgentTask) -> Result<TaskResult> {
    let (resolver_config, _) = hickory_resolver::system_conf::read_system_conf()?;
    dns_with_config(task, resolver_config)
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
    let lookup = resolver
        .lookup(config.target.hostname.as_str(), record_type)
        .with_context(|| format!("DNS lookup failed for {}", config.target.hostname))?;
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
        favicon: None,
    })
}

fn icmp_check(task: &AgentTask, target_policy: &TargetPolicy) -> Result<TaskResult> {
    let config: IcmpConfig =
        serde_json::from_value(task.config.clone()).context("ICMP configuration is invalid")?;
    let result = icmp::ping(
        &config.target.host,
        config.packet_count,
        task.timeout_ms,
        target_policy,
    )?;
    let success_percent = result.received as f64 / result.sent as f64 * 100.0;
    let latency_warning = config.latency_warning_ms.is_some_and(|threshold| {
        result
            .average_latency_ms
            .is_some_and(|value| value >= threshold)
    });
    let mut metrics = BTreeMap::new();
    metrics.insert("packetsSent".to_owned(), json!(result.sent));
    metrics.insert("packetsReceived".to_owned(), json!(result.received));
    metrics.insert("successPercent".to_owned(), json!(success_percent));
    metrics.insert(
        "packetLossPercent".to_owned(),
        json!(100.0 - success_percent),
    );
    metrics.insert(
        "minimumLatencyMs".to_owned(),
        json!(result.minimum_latency_ms),
    );
    metrics.insert(
        "maximumLatencyMs".to_owned(),
        json!(result.maximum_latency_ms),
    );
    if success_percent < config.minimum_success_percent {
        return Ok(down(
            &task.id,
            "ICMP packet success threshold was not met",
            result.average_latency_ms,
            None,
            metrics,
        ));
    }
    Ok(TaskResult {
        task_id: task.id.clone(),
        status: if latency_warning {
            CheckState::Degraded
        } else {
            CheckState::Up
        },
        latency_ms: result.average_latency_ms,
        status_code: None,
        message: latency_warning.then(|| "ICMP latency reached the warning threshold".to_owned()),
        metrics,
        checked_at: time_now(),
        favicon: None,
    })
}

fn wan(task: &AgentTask, target_policy: &TargetPolicy) -> Result<TaskResult> {
    let config: WanConfig =
        serde_json::from_value(task.config.clone()).context("WAN configuration is invalid")?;
    let mut successful = 0;
    let mut warned = false;
    let mut latencies = Vec::new();
    let mut metrics = BTreeMap::new();
    for (index, target) in config.targets.iter().enumerate() {
        target_policy.authorize_host(TargetProtocol::Icmp, &target.host)?;
        match icmp::ping(
            &target.host,
            config.packet_count,
            task.timeout_ms,
            target_policy,
        ) {
            Ok(result) if result.received > 0 => {
                successful += 1;
                if let Some(latency) = result.average_latency_ms {
                    warned |= config
                        .latency_warning_ms
                        .is_some_and(|value| latency >= value);
                    latencies.push(latency);
                    metrics.insert(format!("target{index}LatencyMs"), json!(latency));
                }
                metrics.insert(
                    format!("target{index}SuccessPercent"),
                    json!(result.received as f64 / result.sent as f64 * 100.0),
                );
            }
            Ok(_) => {
                metrics.insert(format!("target{index}SuccessPercent"), json!(0));
            }
            Err(error) => return Err(error.context(format!("WAN target {} failed", target.name))),
        }
        metrics.insert(format!("target{index}Name"), json!(target.name));
    }
    metrics.insert("successfulTargets".to_owned(), json!(successful));
    metrics.insert("targetCount".to_owned(), json!(config.targets.len()));
    let average_latency =
        (!latencies.is_empty()).then(|| latencies.iter().sum::<f64>() / latencies.len() as f64);
    if successful < config.required_successful_targets {
        return Ok(down(
            &task.id,
            "WAN reachability threshold was not met",
            average_latency,
            None,
            metrics,
        ));
    }
    Ok(TaskResult {
        task_id: task.id.clone(),
        status: if warned {
            CheckState::Degraded
        } else {
            CheckState::Up
        },
        latency_ms: average_latency,
        status_code: None,
        message: warned.then(|| "WAN latency reached the warning threshold".to_owned()),
        metrics,
        checked_at: time_now(),
        favicon: None,
    })
}

fn database_check(task: &AgentTask, target_policy: &TargetPolicy) -> Result<TaskResult> {
    let config: DatabaseConfig =
        serde_json::from_value(task.config.clone()).context("Database configuration is invalid")?;
    let result = database::check(
        &config,
        task.secret.as_deref(),
        task.timeout_ms,
        target_policy,
    )?;
    Ok(TaskResult {
        task_id: task.id.clone(),
        status: if result.degraded {
            CheckState::Degraded
        } else {
            CheckState::Up
        },
        latency_ms: Some(result.latency_ms),
        status_code: None,
        message: result.message,
        metrics: result.metrics,
        checked_at: time_now(),
        favicon: None,
    })
}

fn host(task: &AgentTask, snapshot: &HostSnapshot) -> Result<TaskResult> {
    let config: HostConfig =
        serde_json::from_value(task.config.clone()).context("host configuration is invalid")?;
    if config.storage.is_empty() || config.load_warning.is_some() != config.load_critical.is_some()
    {
        bail!("host configuration is invalid");
    }
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
    let resource_critical = snapshot.cpu_percent >= config.cpu_critical_percent
        || memory_percent >= config.memory_critical_percent
        || config
            .load_critical
            .is_some_and(|threshold| snapshot.load_average >= threshold)
        || swap_percent >= config.swap_critical_percent;
    let resource_degraded = snapshot.cpu_percent >= config.cpu_warning_percent
        || memory_percent >= config.memory_warning_percent
        || config
            .load_warning
            .is_some_and(|threshold| snapshot.load_average >= threshold)
        || swap_percent >= config.swap_warning_percent;
    let mut metrics = BTreeMap::new();
    metrics.insert("cpuPercent".to_owned(), json!(snapshot.cpu_percent));
    metrics.insert("memoryPercent".to_owned(), json!(memory_percent));
    if config.load_warning.is_some() {
        metrics.insert("loadAverage".to_owned(), json!(snapshot.load_average));
    }
    metrics.insert("swapPercent".to_owned(), json!(swap_percent));
    metrics.insert("processCount".to_owned(), json!(snapshot.process_count));
    metrics.insert("storageCount".to_owned(), json!(config.storage.len()));

    let mut unavailable = Vec::new();
    let mut storage_critical = false;
    let mut storage_degraded = false;
    let mut highest_storage_percent: Option<f64> = None;
    for (index, monitored) in config.storage.iter().enumerate() {
        metrics.insert(format!("storage{index}Mount"), json!(monitored.mount));
        let disk = snapshot
            .disks
            .iter()
            .find(|disk| mount_identity(&disk.mount) == mount_identity(&monitored.mount));
        let Some(disk) = disk else {
            unavailable.push(monitored.mount.clone());
            continue;
        };
        if disk.total_bytes == 0 || disk.used_bytes > disk.total_bytes {
            unavailable.push(monitored.mount.clone());
            continue;
        }
        let used_percent = disk.used_bytes as f64 / disk.total_bytes as f64 * 100.0;
        highest_storage_percent =
            Some(highest_storage_percent.map_or(used_percent, |current| current.max(used_percent)));
        storage_critical |= used_percent >= monitored.critical_percent;
        storage_degraded |= used_percent >= monitored.warning_percent;
        metrics.insert(format!("storage{index}UsedPercent"), json!(used_percent));
        metrics.insert(format!("storage{index}UsedBytes"), json!(disk.used_bytes));
        metrics.insert(format!("storage{index}TotalBytes"), json!(disk.total_bytes));
    }
    metrics.insert("storagePercent".to_owned(), json!(highest_storage_percent));
    metrics.insert(
        "unavailableStorageCount".to_owned(),
        json!(unavailable.len()),
    );

    let critical = !unavailable.is_empty() || resource_critical || storage_critical;
    let degraded = resource_degraded || storage_degraded;
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
        message: (!unavailable.is_empty())
            .then(|| {
                format!(
                    "Monitored storage is unavailable: {}",
                    unavailable.join(", ")
                )
            })
            .or_else(|| {
                critical.then(|| "A host resource critical threshold was reached".to_owned())
            })
            .or_else(|| {
                degraded.then(|| "A host resource warning threshold was reached".to_owned())
            }),
        metrics,
        checked_at: time_now(),
        favicon: None,
    })
}

fn mount_identity(mount: &str) -> String {
    let replaced = mount.trim().replace('\\', "/");
    let normalized = replaced.trim_end_matches('/');
    let normalized = if normalized.is_empty() {
        "/"
    } else {
        normalized
    };
    if normalized.as_bytes().get(1) == Some(&b':') || normalized.starts_with("//") {
        normalized.to_ascii_lowercase()
    } else {
        normalized.to_owned()
    }
}

fn docker(task: &AgentTask, snapshot: &HostSnapshot) -> Result<TaskResult> {
    let config: DockerConfig =
        serde_json::from_value(task.config.clone()).context("Docker configuration is invalid")?;
    let runtime = snapshot
        .container_runtime
        .as_ref()
        .context("Docker runtime is unavailable")?;
    let pattern = config
        .container_name_pattern
        .as_deref()
        .map(glob::Pattern::new)
        .transpose()
        .context("Container name pattern is invalid")?;
    let containers = runtime
        .containers
        .iter()
        .filter(|container| {
            pattern
                .as_ref()
                .is_none_or(|value| value.matches(&container.name))
        })
        .collect::<Vec<_>>();
    if containers.is_empty() {
        bail!("No containers matched the check");
    }
    let state_failed = config.require_running
        && containers
            .iter()
            .any(|container| container.state != "running");
    let health_failed = config.require_healthy
        && containers
            .iter()
            .any(|container| container.health != "healthy");
    let restarts_failed = containers
        .iter()
        .any(|container| container.restart_count > config.maximum_restarts);
    let cpu_warning = containers
        .iter()
        .any(|container| container.cpu_percent >= config.cpu_warning_percent);
    let memory_warning = containers.iter().any(|container| {
        container.memory_limit_bytes > 0
            && container.memory_used_bytes as f64 / container.memory_limit_bytes as f64 * 100.0
                >= config.memory_warning_percent
    });
    let mut metrics = BTreeMap::new();
    metrics.insert("containerCount".to_owned(), json!(containers.len()));
    metrics.insert(
        "runningContainerCount".to_owned(),
        json!(
            containers
                .iter()
                .filter(|container| container.state == "running")
                .count()
        ),
    );
    metrics.insert(
        "unhealthyContainerCount".to_owned(),
        json!(
            containers
                .iter()
                .filter(|container| container.health == "unhealthy")
                .count()
        ),
    );
    metrics.insert(
        "restartCount".to_owned(),
        json!(
            containers
                .iter()
                .map(|container| container.restart_count)
                .sum::<u64>()
        ),
    );
    let failed = state_failed || health_failed || restarts_failed;
    let degraded = cpu_warning || memory_warning;
    Ok(TaskResult {
        task_id: task.id.clone(),
        status: if failed {
            CheckState::Down
        } else if degraded {
            CheckState::Degraded
        } else {
            CheckState::Up
        },
        latency_ms: None,
        status_code: None,
        message: state_failed
            .then(|| "A container is not running".to_owned())
            .or_else(|| health_failed.then(|| "A container is not healthy".to_owned()))
            .or_else(|| {
                restarts_failed.then(|| "A container exceeded the restart threshold".to_owned())
            })
            .or_else(|| {
                degraded.then(|| "A container resource warning threshold was reached".to_owned())
            }),
        metrics,
        checked_at: time_now(),
        favicon: None,
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
        favicon: None,
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
    } else if details.contains("dns") || details.contains("resolve") || details.contains("lookup") {
        truncate(
            &error
                .chain()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(": "),
            500,
        )
    } else if details.contains("certificate") || details.contains("tls") {
        "TLS validation failed".to_owned()
    } else {
        "Connection failed".to_owned()
    }
}

fn truncate(value: &str, maximum: usize) -> String {
    value.chars().take(maximum).collect()
}

#[cfg(test)]
#[path = "checks_tests/mod.rs"]
mod tests;
