use std::fmt;
use std::time::Duration;

use anyhow::{Context, Result};
use reqwest::StatusCode;
use reqwest::blocking::{Client, Response};
use reqwest::header::USER_AGENT;

use crate::config::AgentConfig;
use crate::models::{AgentPollResponse, HeartbeatRequest, HeartbeatResponse};

pub struct ApiClient {
    client: Client,
    config: AgentConfig,
}

#[derive(Debug)]
pub struct PayloadRejected {
    status: StatusCode,
}

impl fmt::Display for PayloadRejected {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "Mimorii rejected the heartbeat with {}",
            self.status
        )
    }
}

impl std::error::Error for PayloadRejected {}

#[derive(Debug)]
pub struct KeyRejected;

impl fmt::Display for KeyRejected {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("agent key was rejected")
    }
}

impl std::error::Error for KeyRejected {}

impl ApiClient {
    pub fn new(config: AgentConfig) -> Result<Self> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(20))
            .pool_idle_timeout(Duration::from_secs(4))
            .build()?;
        Ok(Self { client, config })
    }

    pub fn config(&self) -> &AgentConfig {
        &self.config
    }

    pub fn verify(&self) -> Result<()> {
        self.poll(1).map(|_| ())
    }

    pub fn poll(&self, limit: usize) -> Result<AgentPollResponse> {
        let response = self
            .client
            .get(format!("{}/agent/tasks", self.config.server_url))
            .query(&[("limit", limit.min(100))])
            .bearer_auth(&self.config.agent_key)
            .header(USER_AGENT, user_agent())
            .send()
            .context("could not reach the Mimorii server")?;
        reject_unauthorized(&response)?;
        response
            .error_for_status()?
            .json()
            .context("agent poll response is invalid")
    }

    pub fn heartbeat(&self, heartbeat: &HeartbeatRequest) -> Result<HeartbeatResponse> {
        let response = self
            .client
            .post(format!("{}/agent/heartbeat", self.config.server_url))
            .bearer_auth(&self.config.agent_key)
            .header(USER_AGENT, user_agent())
            .json(heartbeat)
            .send()
            .context("could not send the agent heartbeat")?;
        reject_unauthorized(&response)?;
        let status = response.status();
        if matches!(
            status,
            StatusCode::BAD_REQUEST
                | StatusCode::PAYLOAD_TOO_LARGE
                | StatusCode::UNPROCESSABLE_ENTITY
        ) {
            return Err(PayloadRejected { status }.into());
        }
        response
            .error_for_status()?
            .json()
            .context("heartbeat response is invalid")
    }
}

fn reject_unauthorized(response: &Response) -> Result<()> {
    if response.status() == StatusCode::UNAUTHORIZED {
        return Err(KeyRejected.into());
    }
    Ok(())
}

fn user_agent() -> String {
    format!("mimorii-agent-desktop/{}", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
#[path = "api_tests.rs"]
mod tests;
