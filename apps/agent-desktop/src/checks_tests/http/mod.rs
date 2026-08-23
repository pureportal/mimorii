mod responses;
mod tls;
mod validation;

use serde_json::{Value, json};

use crate::models::{AgentTask, CheckType};

fn http_task(url: &str, overrides: Value) -> AgentTask {
    let mut config = json!({
        "target": { "url": url, "method": "GET" },
        "expectedStatuses": [200],
        "followRedirects": false,
        "validateTls": true
    });
    let values = overrides
        .as_object()
        .expect("HTTP overrides should be an object");
    for (key, value) in values {
        if ["url", "method", "headers", "secretHeaderName", "body"].contains(&key.as_str()) {
            config["target"][key] = value.clone();
        } else {
            config[key] = value.clone();
        }
    }
    AgentTask {
        id: "task-1".to_owned(),
        _check_id: "check-1".to_owned(),
        check_type: CheckType::Http,
        timeout_ms: 2_000,
        config,
        secret: None,
        _issued_at: "2026-08-12T20:00:00Z".to_owned(),
    }
}
