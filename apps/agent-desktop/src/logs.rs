use anyhow::Result;

#[cfg(any(windows, test))]
use crate::terminal::{self, Tone};

#[cfg(windows)]
const FOLLOW_INTERVAL: std::time::Duration = std::time::Duration::from_millis(500);

#[cfg(windows)]
pub(crate) fn show(lines: usize, follow: bool) -> Result<()> {
    use std::io::{Read, Seek, SeekFrom};

    use anyhow::Context;

    let path = crate::config::log_path()?;
    let content = match std::fs::read(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && !follow => {
            anstream::println!(
                "{} No log entries yet in {}",
                terminal::mark(Tone::Neutral),
                path.display()
            );
            return Ok(());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(error) => {
            return Err(error).with_context(|| format!("could not read {}", path.display()));
        }
    };
    for line in tail(&String::from_utf8_lossy(&content), lines) {
        anstream::println!("{}", styled_line(line));
    }
    if !follow {
        return Ok(());
    }
    let mut offset = content.len() as u64;
    loop {
        std::thread::sleep(FOLLOW_INTERVAL);
        let length = match std::fs::metadata(&path) {
            Ok(metadata) => metadata.len(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
            Err(error) => {
                return Err(error).with_context(|| format!("could not read {}", path.display()));
            }
        };
        if length < offset {
            offset = 0;
        }
        if length == offset {
            continue;
        }
        let mut file = std::fs::File::open(&path)
            .with_context(|| format!("could not read {}", path.display()))?;
        file.seek(SeekFrom::Start(offset))?;
        let mut appended = Vec::new();
        file.read_to_end(&mut appended)?;
        let Some(complete) = appended.iter().rposition(|byte| *byte == b'\n') else {
            continue;
        };
        for line in String::from_utf8_lossy(&appended[..complete]).lines() {
            anstream::println!("{}", styled_line(line));
        }
        offset += complete as u64 + 1;
    }
}

#[cfg(target_os = "linux")]
pub(crate) fn show(lines: usize, follow: bool) -> Result<()> {
    crate::service::show_journal(lines, follow)
}

#[cfg(any(windows, test))]
pub(crate) fn tail(content: &str, lines: usize) -> Vec<&str> {
    let all = content.lines().collect::<Vec<_>>();
    all[all.len().saturating_sub(lines)..].to_vec()
}

#[cfg(any(windows, test))]
pub(crate) fn styled_line(line: &str) -> String {
    let mut parts = line.splitn(3, ' ');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(timestamp), Some("ERROR"), Some(message)) => format!(
            "{} {} {}",
            terminal::paint(terminal::MUTED, timestamp),
            terminal::tinted(Tone::Danger, "ERROR"),
            terminal::tinted(Tone::Danger, message)
        ),
        (Some(timestamp), Some("INFO"), Some(message)) => format!(
            "{} {} {message}",
            terminal::paint(terminal::MUTED, timestamp),
            terminal::tinted(Tone::Success, "INFO ")
        ),
        _ => line.to_owned(),
    }
}

#[cfg(test)]
#[path = "logs_tests.rs"]
mod tests;
