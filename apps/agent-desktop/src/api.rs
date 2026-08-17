use std::time::Duration;

use anyhow::{Context, Result, bail};
use reqwest::blocking::Client;
use reqwest::header::USER_AGENT;

use crate::config::AgentConfig;
use crate::models::{AgentPollResponse, HeartbeatRequest, HeartbeatResponse};

pub struct ApiClient {
    client: Client,
    config: AgentConfig,
}

impl ApiClient {
    pub fn new(config: AgentConfig) -> Result<Self> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(35))
            .build()?;
        Ok(Self { client, config })
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
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            bail!("agent key was rejected");
        }
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
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            bail!("agent key was rejected");
        }
        response
            .error_for_status()?
            .json()
            .context("heartbeat response is invalid")
    }
}

fn user_agent() -> String {
    format!("mimorii-agent-desktop/{}", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
#[path = "api_tests.rs"]
mod tests;
