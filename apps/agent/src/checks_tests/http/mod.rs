mod responses;
mod tls;
mod validation;

use serde_json::{Value, json};

use crate::models::{AgentTask, CheckType};

fn http_task(url: &str, overrides: Value) -> AgentTask {
    let mut config = json!({
        "url": url,
        "method": "GET",
        "expectedStatuses": [200],
        "followRedirects": false,
        "validateTls": true
    });
    let values = overrides
        .as_object()
        .expect("HTTP overrides should be an object");
    config.as_object_mut().unwrap().extend(
        values
            .iter()
            .map(|(key, value)| (key.clone(), value.clone())),
    );
    AgentTask {
        id: "task-1".to_owned(),
        _check_id: "check-1".to_owned(),
        check_type: CheckType::Http,
        timeout_ms: 2_000,
        config,
        _issued_at: "2026-08-12T20:00:00Z".to_owned(),
    }
}
