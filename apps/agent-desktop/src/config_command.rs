use anyhow::Result;
use clap::Args;
use dialoguer::{Input, MultiSelect, Select, theme::ColorfulTheme};

use crate::config::AgentConfig;
use crate::save_config;
use crate::target_policy::{TargetPolicy, TargetProtocol};

#[derive(Args, Debug, Default)]
pub(crate) struct ConfigOptions {
    #[arg(long)]
    pub(crate) allowed_cidrs: Option<String>,
    #[arg(long)]
    pub(crate) allowed_hostnames: Option<String>,
    #[arg(long)]
    pub(crate) allowed_protocols: Option<String>,
    #[arg(long)]
    pub(crate) allowed_ports: Option<String>,
}

impl ConfigOptions {
    pub(crate) fn has_updates(&self) -> bool {
        self.allowed_cidrs.is_some()
            || self.allowed_hostnames.is_some()
            || self.allowed_protocols.is_some()
            || self.allowed_ports.is_some()
    }
}

pub(crate) fn configure(options: ConfigOptions) -> Result<()> {
    let mut config = AgentConfig::load()?;
    if options.has_updates() {
        apply_config_options(&mut config.target_policy, &options)?;
    } else if !interactive_configure(&mut config.target_policy)? {
        println!("configuration unchanged");
        return Ok(());
    }
    let path = save_config(&config)?;
    println!("configuration updated: {}", path.display());
    Ok(())
}

pub(crate) fn apply_config_options(
    policy: &mut TargetPolicy,
    options: &ConfigOptions,
) -> Result<()> {
    if let Some(value) = options.allowed_cidrs.as_deref() {
        policy.set_allowed_cidrs(value)?;
    }
    if let Some(value) = options.allowed_hostnames.as_deref() {
        policy.set_allowed_hostnames(value)?;
    }
    if let Some(value) = options.allowed_protocols.as_deref() {
        policy.set_allowed_protocols(value)?;
    }
    if let Some(value) = options.allowed_ports.as_deref() {
        policy.set_allowed_ports(value)?;
    }
    Ok(())
}

fn interactive_configure(policy: &mut TargetPolicy) -> Result<bool> {
    let theme = ColorfulTheme::default();
    loop {
        let items = [
            format!(
                "IP addresses: {}",
                restriction_summary(&policy.allowed_cidrs)
            ),
            format!(
                "Hostnames: {}",
                restriction_summary(&policy.allowed_hostnames)
            ),
            format!("Protocols: {}", protocol_summary(&policy.allowed_protocols)),
            format!("Ports: {}", restriction_summary(&policy.allowed_ports)),
            "Save and exit".to_owned(),
            "Cancel".to_owned(),
        ];
        let Some(selection) = Select::with_theme(&theme)
            .with_prompt("Agent target policy")
            .items(&items)
            .default(0)
            .interact_opt()?
        else {
            return Ok(false);
        };
        match selection {
            0 => configure_cidrs(policy, &theme)?,
            1 => configure_hostnames(policy, &theme)?,
            2 => configure_protocols(policy, &theme)?,
            3 => configure_ports(policy, &theme)?,
            4 => return Ok(true),
            _ => return Ok(false),
        }
    }
}

fn configure_cidrs(policy: &mut TargetPolicy, theme: &ColorfulTheme) -> Result<()> {
    let mode = Select::with_theme(theme)
        .with_prompt("IP addresses")
        .items(["Allow all IP addresses", "Restrict to CIDRs"])
        .default(usize::from(!policy.allowed_cidrs.is_empty()))
        .interact()?;
    if mode == 0 {
        policy.allowed_cidrs.clear();
        return Ok(());
    }
    let current = join_values(&policy.allowed_cidrs);
    let value = validated_input(
        theme,
        "Allowed CIDRs (comma-separated)",
        &current,
        |value| {
            let mut candidate = TargetPolicy::default();
            candidate.set_allowed_cidrs(value)
        },
    )?;
    policy.set_allowed_cidrs(&value)
}

fn configure_hostnames(policy: &mut TargetPolicy, theme: &ColorfulTheme) -> Result<()> {
    let mode = Select::with_theme(theme)
        .with_prompt("Hostnames")
        .items(["Allow all hostnames", "Restrict to hostnames"])
        .default(usize::from(!policy.allowed_hostnames.is_empty()))
        .interact()?;
    if mode == 0 {
        policy.allowed_hostnames.clear();
        return Ok(());
    }
    let current = policy.allowed_hostnames.join(", ");
    let value = validated_input(
        theme,
        "Allowed hostnames (comma-separated)",
        &current,
        |value| {
            let mut candidate = TargetPolicy::default();
            candidate.set_allowed_hostnames(value)
        },
    )?;
    policy.set_allowed_hostnames(&value)
}

fn configure_protocols(policy: &mut TargetPolicy, theme: &ColorfulTheme) -> Result<()> {
    let mode = Select::with_theme(theme)
        .with_prompt("Protocols")
        .items(["Allow all protocols", "Restrict to protocols"])
        .default(usize::from(!policy.allowed_protocols.is_empty()))
        .interact()?;
    if mode == 0 {
        policy.allowed_protocols.clear();
        return Ok(());
    }
    let labels = TargetProtocol::ALL.map(TargetProtocol::as_str);
    let defaults = TargetProtocol::ALL.map(|protocol| {
        policy.allowed_protocols.is_empty() || policy.allowed_protocols.contains(&protocol)
    });
    let selected = loop {
        let Some(selected) = MultiSelect::with_theme(theme)
            .with_prompt("Allowed protocols")
            .items(labels)
            .defaults(&defaults)
            .interact_opt()?
        else {
            return Ok(());
        };
        if !selected.is_empty() {
            break selected;
        }
        eprintln!("Select at least one protocol");
    };
    policy.allowed_protocols = selected
        .into_iter()
        .map(|index| TargetProtocol::ALL[index])
        .collect();
    Ok(())
}

fn configure_ports(policy: &mut TargetPolicy, theme: &ColorfulTheme) -> Result<()> {
    let mode = Select::with_theme(theme)
        .with_prompt("Ports")
        .items(["Allow all ports", "Restrict to ports"])
        .default(usize::from(!policy.allowed_ports.is_empty()))
        .interact()?;
    if mode == 0 {
        policy.allowed_ports.clear();
        return Ok(());
    }
    let current = join_values(&policy.allowed_ports);
    let value = validated_input(
        theme,
        "Allowed ports (comma-separated)",
        &current,
        |value| {
            let mut candidate = TargetPolicy::default();
            candidate.set_allowed_ports(value)
        },
    )?;
    policy.set_allowed_ports(&value)
}

fn validated_input(
    theme: &ColorfulTheme,
    prompt: &str,
    current: &str,
    mut validate: impl FnMut(&str) -> Result<()>,
) -> Result<String> {
    let mut input = Input::<String>::with_theme(theme).with_prompt(prompt);
    if !current.is_empty() {
        input = input.with_initial_text(current);
    }
    Ok(input
        .validate_with(move |value: &String| {
            if value.trim().is_empty() {
                Err("Enter at least one value".to_owned())
            } else {
                validate(value).map_err(|error| error.to_string())
            }
        })
        .interact_text()?)
}

fn restriction_summary<T: ToString>(values: &[T]) -> String {
    if values.is_empty() {
        "All".to_owned()
    } else {
        join_values(values)
    }
}

fn protocol_summary(protocols: &[TargetProtocol]) -> String {
    if protocols.is_empty() {
        "All".to_owned()
    } else {
        protocols
            .iter()
            .map(|protocol| protocol.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    }
}

fn join_values<T: ToString>(values: &[T]) -> String {
    values
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(", ")
}
