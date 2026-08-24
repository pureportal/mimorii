use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use reqwest::blocking::{Client, Response};
use reqwest::header::{ACCEPT, HeaderMap, HeaderValue, USER_AGENT};
use semver::Version;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tempfile::NamedTempFile;
use url::Url;

const LATEST_RELEASE_API: &str = "https://api.github.com/repos/pureportal/mimorii/releases/latest";
const CHECKSUM_ASSET: &str = "mimorii-sha256-checksums.txt";
const MAX_CHECKSUM_BYTES: u64 = 64 * 1024;
const MAX_PACKAGE_BYTES: u64 = 128 * 1024 * 1024;

#[cfg(target_os = "linux")]
const PACKAGE_ASSET: &str = "mimorii-agent-ubuntu-debian-x64.tar.gz";
#[cfg(target_os = "linux")]
const PACKAGE_SUFFIX: &str = ".tar.gz";
#[cfg(windows)]
const PACKAGE_ASSET: &str = "mimorii-agent-windows-x64.msi";
#[cfg(windows)]
const PACKAGE_SUFFIX: &str = ".msi";

pub struct LatestRelease {
    pub version: Version,
    package: ReleaseAsset,
    checksums: ReleaseAsset,
}

pub struct DownloadedPackage {
    pub file: NamedTempFile,
    pub sha256: String,
}

#[derive(Clone, Debug, Deserialize)]
struct ReleaseMetadata {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<ReleaseAsset>,
}

#[derive(Clone, Debug, Deserialize)]
struct ReleaseAsset {
    name: String,
    state: String,
    size: u64,
    digest: Option<String>,
    browser_download_url: String,
}

pub struct GitHubReleaseClient {
    client: Client,
}

impl GitHubReleaseClient {
    pub fn new() -> Result<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(
            ACCEPT,
            HeaderValue::from_static("application/vnd.github+json"),
        );
        headers.insert(
            "X-GitHub-Api-Version",
            HeaderValue::from_static("2026-03-10"),
        );
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&format!(
                "mimorii-agent-desktop/{}",
                env!("CARGO_PKG_VERSION")
            ))?,
        );
        let client = Client::builder()
            .default_headers(headers)
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(120))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 || !allowed_url(attempt.url()) {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .build()?;
        Ok(Self { client })
    }

    pub fn latest(&self) -> Result<LatestRelease> {
        let response = self
            .client
            .get(LATEST_RELEASE_API)
            .send()
            .context("GitHub's latest release could not be requested")?;
        require_success(&response, "GitHub's latest release")?;
        parse_release(
            response
                .json()
                .context("GitHub returned invalid release metadata")?,
        )
    }

    pub fn download(&self, release: &LatestRelease) -> Result<DownloadedPackage> {
        let checksums = self.download_bytes(&release.checksums, MAX_CHECKSUM_BYTES)?;
        let expected_checksum = checksum_for(&checksums, PACKAGE_ASSET)?;
        let mut file = self.download_file(&release.package, MAX_PACKAGE_BYTES)?;
        let actual_checksum = sha256_file(file.as_file_mut())?;
        let api_checksum = asset_sha256(&release.package)?;
        if actual_checksum != api_checksum || actual_checksum != expected_checksum {
            bail!("SHA-256 verification failed for {PACKAGE_ASSET}");
        }
        Ok(DownloadedPackage {
            file,
            sha256: actual_checksum,
        })
    }

    fn download_bytes(&self, asset: &ReleaseAsset, limit: u64) -> Result<Vec<u8>> {
        let mut response = self.request_asset(asset, limit)?;
        let mut bytes = Vec::with_capacity(asset.size as usize);
        let count = response.by_ref().take(limit + 1).read_to_end(&mut bytes)? as u64;
        if count != asset.size {
            bail!("GitHub returned an unexpected size for {}", asset.name);
        }
        let actual = sha256_bytes(&bytes);
        if actual != asset_sha256(asset)? {
            bail!("SHA-256 verification failed for {}", asset.name);
        }
        Ok(bytes)
    }

    fn download_file(&self, asset: &ReleaseAsset, limit: u64) -> Result<NamedTempFile> {
        let mut response = self.request_asset(asset, limit)?;
        let mut file = tempfile::Builder::new()
            .prefix("mimorii-agent-update-")
            .suffix(PACKAGE_SUFFIX)
            .tempfile()?;
        let count = std::io::copy(&mut response.by_ref().take(limit + 1), &mut file)?;
        if count != asset.size {
            bail!("GitHub returned an unexpected size for {}", asset.name);
        }
        file.as_file_mut().seek(SeekFrom::Start(0))?;
        Ok(file)
    }

    fn request_asset(&self, asset: &ReleaseAsset, limit: u64) -> Result<Response> {
        if asset.size == 0 || asset.size > limit {
            bail!("GitHub reported an invalid size for {}", asset.name);
        }
        let response = self
            .client
            .get(&asset.browser_download_url)
            .send()
            .with_context(|| format!("{} could not be downloaded", asset.name))?;
        require_success(&response, &asset.name)?;
        if !allowed_url(response.url()) {
            bail!("GitHub redirected {} to an untrusted host", asset.name);
        }
        Ok(response)
    }
}

fn parse_release(metadata: ReleaseMetadata) -> Result<LatestRelease> {
    if metadata.draft || metadata.prerelease {
        bail!("GitHub's latest release is not a stable published release");
    }
    let version_text = metadata
        .tag_name
        .strip_prefix('v')
        .ok_or_else(|| anyhow!("GitHub's latest release tag must start with v"))?;
    let version = Version::parse(version_text).context("GitHub's latest release tag is invalid")?;
    if metadata.tag_name != format!("v{version}") {
        bail!("GitHub's latest release tag is not canonical semantic versioning");
    }

    let package = unique_asset(&metadata.assets, PACKAGE_ASSET, &metadata.tag_name)?;
    let checksums = unique_asset(&metadata.assets, CHECKSUM_ASSET, &metadata.tag_name)?;
    Ok(LatestRelease {
        version,
        package,
        checksums,
    })
}

fn unique_asset(assets: &[ReleaseAsset], name: &str, tag: &str) -> Result<ReleaseAsset> {
    let matches = assets
        .iter()
        .filter(|asset| asset.name == name)
        .collect::<Vec<_>>();
    if matches.len() != 1 {
        bail!("GitHub's latest release must contain exactly one {name}");
    }
    let asset = matches[0];
    if asset.state != "uploaded" {
        bail!("GitHub release asset {name} is not ready");
    }
    let expected_url =
        format!("https://github.com/pureportal/mimorii/releases/download/{tag}/{name}");
    if asset.browser_download_url != expected_url {
        bail!("GitHub release asset {name} has an unexpected download URL");
    }
    asset_sha256(asset)?;
    Ok(asset.clone())
}

fn checksum_for(manifest: &[u8], requested_name: &str) -> Result<String> {
    let content = std::str::from_utf8(manifest).context("The checksum manifest is not UTF-8")?;
    let mut checksums = HashMap::new();
    for line in content.lines() {
        let (digest, name) = line
            .split_once("  ")
            .ok_or_else(|| anyhow!("The checksum manifest contains an invalid entry"))?;
        validate_sha256(digest)?;
        if name.is_empty() || name.contains(['/', '\\']) || checksums.insert(name, digest).is_some()
        {
            bail!("The checksum manifest contains an invalid asset name");
        }
    }
    checksums
        .get(requested_name)
        .map(|digest| (*digest).to_owned())
        .ok_or_else(|| anyhow!("The checksum manifest does not contain {requested_name}"))
}

fn asset_sha256(asset: &ReleaseAsset) -> Result<String> {
    let value = asset
        .digest
        .as_deref()
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .ok_or_else(|| anyhow!("GitHub release asset {} has no SHA-256 digest", asset.name))?;
    validate_sha256(value)?;
    Ok(value.to_owned())
}

fn validate_sha256(value: &str) -> Result<()> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        bail!("Invalid SHA-256 digest");
    }
    Ok(())
}

fn allowed_url(url: &Url) -> bool {
    url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(
            url.host_str(),
            Some("api.github.com" | "github.com" | "release-assets.githubusercontent.com")
        )
}

fn require_success(response: &Response, label: &str) -> Result<()> {
    if !response.status().is_success() {
        bail!("{label} returned HTTP {}", response.status());
    }
    Ok(())
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn sha256_file(file: &mut std::fs::File) -> Result<String> {
    file.seek(SeekFrom::Start(0))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    file.seek(SeekFrom::Start(0))?;
    Ok(format!("{:x}", digest.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str, tag: &str, digest: &str) -> ReleaseAsset {
        ReleaseAsset {
            name: name.to_owned(),
            state: "uploaded".to_owned(),
            size: 12,
            digest: Some(format!("sha256:{digest}")),
            browser_download_url: format!(
                "https://github.com/pureportal/mimorii/releases/download/{tag}/{name}"
            ),
        }
    }

    #[test]
    fn accepts_canonical_latest_release_metadata() {
        let digest = "a".repeat(64);
        let release = parse_release(ReleaseMetadata {
            tag_name: "v8.1.0".to_owned(),
            draft: false,
            prerelease: false,
            assets: vec![
                asset(PACKAGE_ASSET, "v8.1.0", &digest),
                asset(CHECKSUM_ASSET, "v8.1.0", &digest),
            ],
        })
        .unwrap();
        assert_eq!(release.version, Version::new(8, 1, 0));
    }

    #[test]
    fn rejects_noncanonical_asset_urls() {
        let digest = "a".repeat(64);
        let mut package = asset(PACKAGE_ASSET, "v8.1.0", &digest);
        package.browser_download_url =
            format!("https://example.com/releases/v8.1.0/{PACKAGE_ASSET}");
        let error = parse_release(ReleaseMetadata {
            tag_name: "v8.1.0".to_owned(),
            draft: false,
            prerelease: false,
            assets: vec![package, asset(CHECKSUM_ASSET, "v8.1.0", &digest)],
        })
        .err()
        .unwrap();
        assert!(error.to_string().contains("unexpected download URL"));
    }

    #[test]
    fn rejects_prereleases() {
        let digest = "a".repeat(64);
        let package = asset(PACKAGE_ASSET, "v8.1.0", &digest);
        let error = parse_release(ReleaseMetadata {
            tag_name: "v8.1.0".to_owned(),
            draft: false,
            prerelease: true,
            assets: vec![package, asset(CHECKSUM_ASSET, "v8.1.0", &digest)],
        })
        .err()
        .unwrap();
        assert!(error.to_string().contains("stable published"));
    }

    #[test]
    fn rejects_duplicate_assets() {
        let digest = "a".repeat(64);
        let package = asset(PACKAGE_ASSET, "v8.1.0", &digest);
        let error = parse_release(ReleaseMetadata {
            tag_name: "v8.1.0".to_owned(),
            draft: false,
            prerelease: false,
            assets: vec![
                package.clone(),
                package,
                asset(CHECKSUM_ASSET, "v8.1.0", &digest),
            ],
        })
        .err()
        .unwrap();
        assert!(error.to_string().contains("exactly one"));
    }

    #[test]
    fn reads_only_exact_checksum_entries() {
        let digest = "1".repeat(64);
        let manifest = format!("{digest}  {PACKAGE_ASSET}\n");
        assert_eq!(
            checksum_for(manifest.as_bytes(), PACKAGE_ASSET).unwrap(),
            digest
        );
        assert!(checksum_for(manifest.as_bytes(), "other-package").is_err());
    }

    #[test]
    fn rejects_duplicate_checksum_entries() {
        let digest = "1".repeat(64);
        let manifest = format!("{digest}  {PACKAGE_ASSET}\n{digest}  {PACKAGE_ASSET}\n");
        assert!(checksum_for(manifest.as_bytes(), PACKAGE_ASSET).is_err());
    }

    #[test]
    #[ignore = "requires the public GitHub release service"]
    fn downloads_and_verifies_the_live_platform_package() {
        let client = GitHubReleaseClient::new().unwrap();
        let release = client.latest().unwrap();
        let package = client.download(&release).unwrap();
        assert!(
            package
                .file
                .path()
                .to_string_lossy()
                .ends_with(PACKAGE_SUFFIX)
        );
        assert_eq!(package.sha256.len(), 64);
    }
}
