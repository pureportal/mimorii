use std::collections::BTreeMap;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use mysql::prelude::Queryable;
use postgres_rustls::MakeTlsConnector;
use redis::IntoConnectionInfo;
use rustls::{ClientConfig, RootCertStore};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio_postgres::config::SslMode;
use tokio_postgres::{Client, Config as PostgresConfig, NoTls, SimpleQueryMessage};
use url::Url;

use crate::target_policy::{TargetPolicy, TargetProtocol};

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseEngine {
    Postgresql,
    Mysql,
    Redis,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConfig {
    pub target: DatabaseTarget,
    pub connection_warning_percent: f64,
    pub replication_lag_warning_seconds: Option<f64>,
    pub slow_query_warning_count: Option<u64>,
    pub query: Option<DatabaseQuery>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseTarget {
    pub engine: DatabaseEngine,
    pub host: String,
    pub port: u16,
    pub database: Option<String>,
    pub username: Option<String>,
    pub tls: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseQuery {
    pub statement: String,
    #[serde(default)]
    pub expected_value: Option<Value>,
}

pub struct DatabaseResult {
    pub latency_ms: f64,
    pub degraded: bool,
    pub message: Option<String>,
    pub metrics: BTreeMap<String, Value>,
}

pub fn check(
    config: &DatabaseConfig,
    password: Option<&str>,
    timeout_ms: u64,
    policy: &TargetPolicy,
) -> Result<DatabaseResult> {
    policy.authorize_request(TargetProtocol::Tcp, &config.target.host, config.target.port)?;
    let addresses = (config.target.host.as_str(), config.target.port)
        .to_socket_addrs()
        .context("target could not be resolved")?
        .collect::<Vec<SocketAddr>>();
    let address = policy
        .authorize_addresses(addresses)?
        .first()
        .context("target could not be resolved")?
        .ip();
    let started = Instant::now();
    let metrics = match config.target.engine {
        DatabaseEngine::Postgresql => postgresql(config, password, address, timeout_ms)?,
        DatabaseEngine::Mysql => mysql(config, password, address, timeout_ms)?,
        DatabaseEngine::Redis => redis(config, password, address, timeout_ms)?,
    };
    let connection_warning = metric_number(&metrics, "connectionUtilizationPercent")
        >= config.connection_warning_percent;
    let replication_warning = config
        .replication_lag_warning_seconds
        .is_some_and(|threshold| metric_number(&metrics, "replicationLagSeconds") >= threshold);
    let slow_query_warning = config
        .slow_query_warning_count
        .is_some_and(|threshold| metric_number(&metrics, "slowQueries") >= threshold as f64);
    Ok(DatabaseResult {
        latency_ms: elapsed_ms(started),
        degraded: connection_warning || replication_warning || slow_query_warning,
        message: connection_warning
            .then(|| "Database connection usage reached the warning threshold".to_owned())
            .or_else(|| {
                replication_warning
                    .then(|| "Database replication lag reached the warning threshold".to_owned())
            })
            .or_else(|| {
                slow_query_warning
                    .then(|| "Database slow queries reached the warning threshold".to_owned())
            }),
        metrics,
    })
}

fn postgresql(
    config: &DatabaseConfig,
    password: Option<&str>,
    address: IpAddr,
    timeout_ms: u64,
) -> Result<BTreeMap<String, Value>> {
    let runtime = runtime()?;
    let pg = postgres_config(config, password, address, timeout_ms)?;
    if config.target.tls {
        let mut roots = RootCertStore::empty();
        let certificates = rustls_native_certs::load_native_certs();
        roots.add_parsable_certificates(certificates.certs);
        if roots.is_empty() {
            bail!("No trusted TLS roots are available");
        }
        let mut tls = ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        postgres_rustls::set_postgresql_alpn(&mut tls);
        runtime.block_on(async {
            let (client, connection) = pg
                .connect(MakeTlsConnector::new(Arc::new(tls).into()))
                .await?;
            tokio::spawn(connection);
            postgres_metrics(&client, config).await
        })
    } else {
        runtime.block_on(async {
            let (client, connection) = pg.connect(NoTls).await?;
            tokio::spawn(connection);
            postgres_metrics(&client, config).await
        })
    }
}

fn postgres_config(
    config: &DatabaseConfig,
    password: Option<&str>,
    address: IpAddr,
    timeout_ms: u64,
) -> Result<PostgresConfig> {
    let mut pg = PostgresConfig::new();
    pg.host(&config.target.host)
        .hostaddr(address)
        .port(config.target.port)
        .connect_timeout(Duration::from_millis(timeout_ms))
        .ssl_mode(if config.target.tls {
            SslMode::Require
        } else {
            SslMode::Disable
        })
        .user(
            config
                .target
                .username
                .as_deref()
                .context("Database username is required")?,
        )
        .dbname(
            config
                .target
                .database
                .as_deref()
                .context("Database name is required")?,
        );
    if let Some(password) = password {
        pg.password(password);
    }
    Ok(pg)
}

async fn postgres_metrics(
    client: &Client,
    config: &DatabaseConfig,
) -> Result<BTreeMap<String, Value>> {
    let rows = client
        .simple_query(
            "SELECT current_setting('server_version'),\
             (SELECT COUNT(*) FROM pg_stat_activity)::text,\
             current_setting('max_connections'), pg_database_size(current_database())::text,\
             xact_commit::text, xact_rollback::text,\
             CASE WHEN blks_hit + blks_read = 0 THEN NULL ELSE\
             ROUND(blks_hit * 100.0 / (blks_hit + blks_read), 2)::text END, deadlocks::text,\
             (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active' AND\
             query_start < CURRENT_TIMESTAMP - INTERVAL '5 seconds')::text,\
             COALESCE(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - pg_last_xact_replay_timestamp()), 0)::text\
             FROM pg_stat_database WHERE datname = current_database()",
        )
        .await?;
    let row = simple_row(&rows).context("Database statistics are unavailable")?;
    if let Some(query) = &config.query {
        client.simple_query("BEGIN TRANSACTION READ ONLY").await?;
        let result = client.simple_query(&query.statement).await;
        let rollback = client.simple_query("ROLLBACK").await;
        let result = result?;
        rollback?;
        assert_query(simple_row(&result).and_then(|row| row.get(0)), query)?;
    }
    let connections = parse_number(row.get(1));
    let max_connections = parse_number(row.get(2));
    Ok(BTreeMap::from([
        ("engine".to_owned(), json!("postgresql")),
        ("version".to_owned(), json!(row.get(0).unwrap_or("unknown"))),
        ("connections".to_owned(), json!(connections)),
        ("maxConnections".to_owned(), json!(max_connections)),
        (
            "connectionUtilizationPercent".to_owned(),
            json!(ratio(connections, max_connections)),
        ),
        (
            "databaseSizeBytes".to_owned(),
            json!(parse_number(row.get(3))),
        ),
        (
            "transactionsCommitted".to_owned(),
            json!(parse_number(row.get(4))),
        ),
        (
            "transactionsRolledBack".to_owned(),
            json!(parse_number(row.get(5))),
        ),
        ("cacheHitPercent".to_owned(), optional_number(row.get(6))),
        ("deadlocks".to_owned(), json!(parse_number(row.get(7)))),
        ("slowQueries".to_owned(), json!(parse_number(row.get(8)))),
        (
            "replicationLagSeconds".to_owned(),
            json!(parse_number(row.get(9))),
        ),
    ]))
}

fn mysql(
    config: &DatabaseConfig,
    password: Option<&str>,
    address: IpAddr,
    timeout_ms: u64,
) -> Result<BTreeMap<String, Value>> {
    let connection_host = if config.target.tls {
        config.target.host.clone()
    } else {
        address.to_string()
    };
    let mut builder = mysql::OptsBuilder::default()
        .ip_or_hostname(Some(connection_host))
        .tcp_port(config.target.port)
        .db_name(config.target.database.clone())
        .user(config.target.username.clone())
        .pass(password.map(str::to_owned))
        .tcp_connect_timeout(Some(Duration::from_millis(timeout_ms)))
        .read_timeout(Some(Duration::from_millis(timeout_ms)))
        .write_timeout(Some(Duration::from_millis(timeout_ms)));
    if config.target.tls {
        builder = builder.ssl_opts(Some(mysql::SslOpts::default()));
    }
    let mut connection = mysql::Conn::new(builder)?;
    let row = connection
        .query_first::<mysql::Row, _>(
            "SELECT CONCAT(@@version), CONCAT(@@max_connections),\
             (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Threads_connected'),\
             (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Questions'),\
             (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Slow_queries'),\
             (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Aborted_connects'),\
             (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Bytes_received'),\
             (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Bytes_sent'),\
             (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Uptime')",
        )?
        .context("Database statistics are unavailable")?;
    if let Some(query) = &config.query {
        connection.query_drop("START TRANSACTION READ ONLY")?;
        let result = connection.query_first::<mysql::Row, _>(&query.statement);
        let rollback = connection.query_drop("ROLLBACK");
        let result = result?;
        rollback?;
        let actual = result.as_ref().and_then(|row| row.get::<String, _>(0));
        assert_query(actual.as_deref(), query)?;
    }
    let connections = mysql_number(&row, 2);
    let max_connections = mysql_number(&row, 1);
    Ok(BTreeMap::from([
        ("engine".to_owned(), json!("mysql")),
        (
            "version".to_owned(),
            json!(
                row.get::<String, _>(0)
                    .unwrap_or_else(|| "unknown".to_owned())
            ),
        ),
        ("connections".to_owned(), json!(connections)),
        ("maxConnections".to_owned(), json!(max_connections)),
        (
            "connectionUtilizationPercent".to_owned(),
            json!(ratio(connections, max_connections)),
        ),
        ("questions".to_owned(), json!(mysql_number(&row, 3))),
        ("slowQueries".to_owned(), json!(mysql_number(&row, 4))),
        ("abortedConnects".to_owned(), json!(mysql_number(&row, 5))),
        ("bytesReceived".to_owned(), json!(mysql_number(&row, 6))),
        ("bytesSent".to_owned(), json!(mysql_number(&row, 7))),
        ("uptimeSeconds".to_owned(), json!(mysql_number(&row, 8))),
        ("replicationLagSeconds".to_owned(), json!(0)),
    ]))
}

fn redis(
    config: &DatabaseConfig,
    password: Option<&str>,
    address: IpAddr,
    timeout_ms: u64,
) -> Result<BTreeMap<String, Value>> {
    let mut url = Url::parse(if config.target.tls {
        "rediss://localhost"
    } else {
        "redis://localhost"
    })?;
    let connection_host = if config.target.tls {
        config.target.host.clone()
    } else {
        address.to_string()
    };
    url.set_host(Some(&connection_host))?;
    url.set_port(Some(config.target.port))
        .map_err(|_| anyhow!("Database port is invalid"))?;
    if let Some(username) = &config.target.username {
        url.set_username(username)
            .map_err(|_| anyhow!("Database username is invalid"))?;
    }
    if let Some(password) = password {
        url.set_password(Some(password))
            .map_err(|_| anyhow!("Database password is invalid"))?;
    }
    if let Some(database) = &config.target.database {
        url.set_path(&format!("/{database}"));
    }
    let info = url.as_str().into_connection_info()?;
    let client = redis::Client::open(info)?;
    let mut connection = client.get_connection_with_timeout(Duration::from_millis(timeout_ms))?;
    connection.set_read_timeout(Some(Duration::from_millis(timeout_ms)))?;
    connection.set_write_timeout(Some(Duration::from_millis(timeout_ms)))?;
    let info: String = redis::cmd("INFO").query(&mut connection)?;
    let values = parse_redis_info(&info);
    let connections = redis_number(&values, "connected_clients");
    let max_connections = redis_number(&values, "maxclients");
    let hits = redis_number(&values, "keyspace_hits");
    let misses = redis_number(&values, "keyspace_misses");
    Ok(BTreeMap::from([
        ("engine".to_owned(), json!("redis")),
        (
            "version".to_owned(),
            json!(values.get("redis_version").copied().unwrap_or("unknown")),
        ),
        ("connections".to_owned(), json!(connections)),
        ("maxConnections".to_owned(), json!(max_connections)),
        (
            "connectionUtilizationPercent".to_owned(),
            json!(ratio(connections, max_connections)),
        ),
        (
            "memoryUsedBytes".to_owned(),
            json!(redis_number(&values, "used_memory")),
        ),
        (
            "memoryPeakBytes".to_owned(),
            json!(redis_number(&values, "used_memory_peak")),
        ),
        (
            "cacheHitPercent".to_owned(),
            json!(ratio(hits, hits + misses)),
        ),
        (
            "rejectedConnections".to_owned(),
            json!(redis_number(&values, "rejected_connections")),
        ),
        (
            "evictedKeys".to_owned(),
            json!(redis_number(&values, "evicted_keys")),
        ),
        (
            "uptimeSeconds".to_owned(),
            json!(redis_number(&values, "uptime_in_seconds")),
        ),
        ("replicationLagSeconds".to_owned(), json!(0)),
        ("slowQueries".to_owned(), json!(0)),
    ]))
}

fn runtime() -> Result<tokio::runtime::Runtime> {
    Ok(tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?)
}

fn simple_row(messages: &[SimpleQueryMessage]) -> Option<&tokio_postgres::SimpleQueryRow> {
    messages.iter().find_map(|message| match message {
        SimpleQueryMessage::Row(row) => Some(row),
        _ => None,
    })
}

fn assert_query(actual: Option<&str>, query: &DatabaseQuery) -> Result<()> {
    let Some(expected) = &query.expected_value else {
        return Ok(());
    };
    let matches = match expected {
        Value::Null => actual.is_none(),
        Value::Bool(value) => actual.and_then(parse_boolean) == Some(*value),
        Value::Number(value) => actual.and_then(|item| item.parse::<f64>().ok()) == value.as_f64(),
        Value::String(value) => actual == Some(value),
        _ => false,
    };
    if !matches {
        bail!("Database query value did not match");
    }
    Ok(())
}

fn parse_boolean(value: &str) -> Option<bool> {
    match value.to_ascii_lowercase().as_str() {
        "1" | "true" | "t" => Some(true),
        "0" | "false" | "f" => Some(false),
        _ => None,
    }
}

fn parse_number(value: Option<&str>) -> f64 {
    value.and_then(|item| item.parse().ok()).unwrap_or(0.0)
}

fn optional_number(value: Option<&str>) -> Value {
    value
        .and_then(|item| item.parse::<f64>().ok())
        .map_or(Value::Null, |item| json!(item))
}

fn mysql_number(row: &mysql::Row, index: usize) -> f64 {
    row.get::<String, _>(index)
        .and_then(|item| item.parse().ok())
        .unwrap_or(0.0)
}

fn parse_redis_info(value: &str) -> BTreeMap<&str, &str> {
    value
        .lines()
        .filter(|line| !line.starts_with('#'))
        .filter_map(|line| line.split_once(':'))
        .collect()
}

fn redis_number(values: &BTreeMap<&str, &str>, key: &str) -> f64 {
    values
        .get(key)
        .and_then(|value| value.parse().ok())
        .unwrap_or(0.0)
}

fn ratio(value: f64, maximum: f64) -> f64 {
    if maximum > 0.0 {
        value / maximum * 100.0
    } else {
        0.0
    }
}

fn metric_number(metrics: &BTreeMap<String, Value>, key: &str) -> f64 {
    metrics.get(key).and_then(Value::as_f64).unwrap_or(0.0)
}

fn elapsed_ms(started: Instant) -> f64 {
    (started.elapsed().as_secs_f64() * 10_000.0).round() / 10.0
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{DatabaseQuery, assert_query, parse_redis_info, ratio};

    #[test]
    fn parses_redis_info_and_connection_ratios() {
        let values = parse_redis_info("# Server\r\nredis_version:8.0\r\nconnected_clients:5\r\n");
        assert_eq!(values.get("redis_version"), Some(&"8.0"));
        assert_eq!(values.get("connected_clients"), Some(&"5"));
        assert_eq!(ratio(5.0, 20.0), 25.0);
        assert_eq!(ratio(5.0, 0.0), 0.0);
    }

    #[test]
    fn compares_typed_custom_query_values() {
        for (actual, expected) in [
            (Some("42"), json!(42)),
            (Some("true"), json!(true)),
            (Some("1"), json!(true)),
            (Some("f"), json!(false)),
            (Some("ready"), json!("ready")),
            (None, json!(null)),
        ] {
            assert!(
                assert_query(
                    actual,
                    &DatabaseQuery {
                        statement: "SELECT 1".to_owned(),
                        expected_value: Some(expected),
                    },
                )
                .is_ok()
            );
        }
        assert!(
            assert_query(
                Some("wrong"),
                &DatabaseQuery {
                    statement: "SELECT 1".to_owned(),
                    expected_value: Some(json!("ready")),
                },
            )
            .is_err()
        );
    }
}
