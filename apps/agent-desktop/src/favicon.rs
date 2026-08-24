use std::collections::HashSet;
use std::io::Read;
use std::net::{SocketAddr, ToSocketAddrs};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, CONTENT_TYPE, LOCATION};
use reqwest::redirect::Policy;
use scraper::{Html, Selector};
use url::Url;

use crate::target_policy::{TargetPolicy, TargetProtocol};

const MAXIMUM_PAGE_BYTES: u64 = 512 * 1024;
const MAXIMUM_IMAGE_BYTES: u64 = 5 * 1024 * 1024;
const MAXIMUM_REDIRECTS: usize = 3;
const MAXIMUM_CANDIDATES: usize = 12;

struct RemoteResponse {
    body: Vec<u8>,
    content_type: Option<String>,
    final_url: Url,
}

struct Candidate {
    score: u64,
    url: Url,
}

pub fn retrieve(url: &str, timeout_ms: u64, target_policy: &TargetPolicy) -> Result<Vec<u8>> {
    retrieve_with_resolver(url, timeout_ms, target_policy, |hostname, port| {
        (hostname, port)
            .to_socket_addrs()
            .with_context(|| format!("DNS lookup failed for {hostname}"))
            .map(Iterator::collect)
    })
}

pub(crate) fn retrieve_with_resolver(
    website_url: &str,
    timeout_ms: u64,
    target_policy: &TargetPolicy,
    resolve: impl Fn(&str, u16) -> Result<Vec<SocketAddr>>,
) -> Result<Vec<u8>> {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let initial_url = Url::parse(website_url).context("Favicon URL is invalid")?;
    let page = fetch(
        initial_url.clone(),
        MAXIMUM_PAGE_BYTES,
        "text/html,application/xhtml+xml",
        deadline,
        target_policy,
        &resolve,
    );
    let (page_url, mut candidates) = match page {
        Ok(page) => {
            let candidates = if page.content_type.as_deref().is_none_or(is_html) {
                discover(&page.body, &page.final_url)
            } else {
                Vec::new()
            };
            (page.final_url, candidates)
        }
        Err(_) => (initial_url, Vec::new()),
    };
    candidates.push(Candidate {
        score: 0,
        url: page_url.join("/favicon.ico")?,
    });
    candidates.sort_by(|left, right| right.score.cmp(&left.score));

    let mut seen = HashSet::new();
    for candidate in candidates
        .into_iter()
        .filter(|candidate| seen.insert(candidate.url.to_string()))
        .take(MAXIMUM_CANDIDATES)
    {
        let Ok(image) = fetch(
            candidate.url,
            MAXIMUM_IMAGE_BYTES,
            "image/*",
            deadline,
            target_policy,
            &resolve,
        ) else {
            continue;
        };
        if looks_like_image(&image.body, image.content_type.as_deref()) {
            return Ok(image.body);
        }
    }
    bail!("Favicon could not be retrieved")
}

fn fetch(
    mut url: Url,
    maximum_bytes: u64,
    accept: &str,
    deadline: Instant,
    target_policy: &TargetPolicy,
    resolve: &impl Fn(&str, u16) -> Result<Vec<SocketAddr>>,
) -> Result<RemoteResponse> {
    for redirects in 0..=MAXIMUM_REDIRECTS {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            bail!("Favicon retrieval timed out");
        }
        let (protocol, hostname, port) = target(&url)?;
        target_policy.authorize_request(protocol, hostname, port)?;
        let addresses = target_policy.authorize_addresses(resolve(hostname, port)?)?;
        let mut client = Client::builder()
            .timeout(remaining)
            .connect_timeout(remaining)
            .no_proxy()
            .redirect(Policy::none());
        if matches!(url.host(), Some(url::Host::Domain(_))) {
            client = client.resolve_to_addrs(hostname, &addresses);
        }
        let response = client
            .build()?
            .get(url.clone())
            .header(ACCEPT, accept)
            .header("accept-encoding", "identity")
            .header(
                "user-agent",
                format!(
                    "mimorii-agent-desktop/{} favicon-fetcher",
                    env!("CARGO_PKG_VERSION")
                ),
            )
            .send()?;
        if response.status().is_redirection() {
            if redirects == MAXIMUM_REDIRECTS {
                bail!("Too many favicon redirects");
            }
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .context("Favicon redirect location is invalid")?;
            url = url.join(location)?;
            continue;
        }
        if !response.status().is_success() {
            bail!(
                "Favicon request returned HTTP {}",
                response.status().as_u16()
            );
        }
        if response
            .content_length()
            .is_some_and(|size| size > maximum_bytes)
        {
            bail!("Favicon response is too large");
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let mut body = Vec::new();
        response.take(maximum_bytes + 1).read_to_end(&mut body)?;
        if body.len() as u64 > maximum_bytes {
            bail!("Favicon response is too large");
        }
        return Ok(RemoteResponse {
            body,
            content_type,
            final_url: url,
        });
    }
    unreachable!()
}

fn target(url: &Url) -> Result<(TargetProtocol, &str, u16)> {
    let protocol = match url.scheme() {
        "http" => TargetProtocol::Http,
        "https" => TargetProtocol::Https,
        _ => bail!("Favicon protocol is not allowed"),
    };
    let hostname = url.host_str().context("Favicon URL has no host")?;
    let port = url
        .port_or_known_default()
        .context("Favicon URL has no port")?;
    Ok((protocol, hostname, port))
}

fn discover(body: &[u8], document_url: &Url) -> Vec<Candidate> {
    let document = Html::parse_document(&String::from_utf8_lossy(body));
    let base_selector = Selector::parse("base[href]").expect("valid base selector");
    let link_selector = Selector::parse("link[href][rel]").expect("valid link selector");
    let base_url = document
        .select(&base_selector)
        .find_map(|element| element.value().attr("href"))
        .and_then(|value| http_url(value, document_url))
        .unwrap_or_else(|| document_url.clone());
    document
        .select(&link_selector)
        .filter_map(|element| {
            let rel = element.value().attr("rel")?;
            if !rel.split_ascii_whitespace().any(|value| {
                let value = value.to_ascii_lowercase();
                value == "icon" || value.starts_with("apple-touch-icon")
            }) {
                return None;
            }
            let url = http_url(element.value().attr("href")?, &base_url)?;
            Some(Candidate {
                score: icon_score(element.value().attr("sizes")),
                url,
            })
        })
        .collect()
}

fn http_url(value: &str, base: &Url) -> Option<Url> {
    let url = base.join(value).ok()?;
    (["http", "https"].contains(&url.scheme())
        && url.username().is_empty()
        && url.password().is_none())
    .then_some(url)
}

fn icon_score(sizes: Option<&str>) -> u64 {
    let Some(sizes) = sizes else {
        return 1;
    };
    if sizes
        .split_ascii_whitespace()
        .any(|value| value.eq_ignore_ascii_case("any"))
    {
        return u64::MAX;
    }
    sizes
        .split_ascii_whitespace()
        .filter_map(|size| {
            size.to_ascii_lowercase()
                .split_once('x')
                .map(|(width, height)| {
                    width
                        .parse::<u64>()
                        .ok()?
                        .checked_mul(height.parse::<u64>().ok()?)
                })
        })
        .flatten()
        .max()
        .unwrap_or(1)
}

fn is_html(content_type: &str) -> bool {
    let content_type = content_type.to_ascii_lowercase();
    content_type.starts_with("text/html") || content_type.starts_with("application/xhtml+xml")
}

fn looks_like_image(body: &[u8], content_type: Option<&str>) -> bool {
    let content_type_is_svg = content_type.is_some_and(|value| {
        let value = value.to_ascii_lowercase();
        value.starts_with("image/svg+xml") || value.starts_with("application/svg+xml")
    });
    let text_prefix = String::from_utf8_lossy(&body[..body.len().min(4_096)]);
    let text_prefix = text_prefix
        .trim_start_matches(|character: char| character.is_whitespace() || character == '\u{feff}')
        .to_ascii_lowercase();
    let svg = text_prefix.starts_with("<svg")
        || (text_prefix.starts_with("<?xml") && text_prefix.contains("<svg"));
    body.starts_with(b"\x89PNG\r\n\x1a\n")
        || body.starts_with(b"\xff\xd8\xff")
        || body.starts_with(b"GIF87a")
        || body.starts_with(b"GIF89a")
        || (body.starts_with(b"RIFF") && body.get(8..12) == Some(b"WEBP"))
        || body.starts_with(b"\x00\x00\x01\x00")
        || svg
        || (content_type_is_svg && text_prefix.contains("<svg"))
}

#[cfg(test)]
#[path = "favicon_tests.rs"]
mod tests;
