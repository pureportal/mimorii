use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};

use crate::models::HostSnapshot;

static SNAPSHOT_FILE_ID: AtomicU64 = AtomicU64::new(0);

pub struct SnapshotBatch {
    files: Vec<PathBuf>,
    snapshots: Vec<HostSnapshot>,
}

impl SnapshotBatch {
    pub fn is_empty(&self) -> bool {
        self.snapshots.is_empty()
    }

    pub fn snapshots(&self) -> &[HostSnapshot] {
        &self.snapshots
    }
}

#[derive(Clone)]
pub struct SnapshotStore {
    directory: PathBuf,
}

impl SnapshotStore {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub fn append(&self, snapshot: &HostSnapshot) -> Result<()> {
        fs::create_dir_all(&self.directory).with_context(|| {
            format!(
                "could not create the local collection at {}",
                self.directory.display()
            )
        })?;
        let identity = snapshot_file_identity();
        let temporary_path = self.directory.join(format!(".{identity}.pending"));
        let final_path = self.directory.join(format!("{identity}.json"));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary_path)
            .context("could not stage a collected snapshot")?;
        serde_json::to_writer(&mut file, snapshot).context("could not serialize a snapshot")?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        fs::rename(&temporary_path, &final_path)
            .context("could not commit a collected snapshot locally")?;
        Ok(())
    }

    pub fn load(&self) -> Result<SnapshotBatch> {
        if !self.directory.exists() {
            return Ok(SnapshotBatch {
                files: Vec::new(),
                snapshots: Vec::new(),
            });
        }
        let entries = fs::read_dir(&self.directory)?.collect::<std::io::Result<Vec<_>>>()?;
        let mut files = entries
            .into_iter()
            .map(|entry| entry.path())
            .filter(|path| {
                path.extension()
                    .is_some_and(|extension| extension == "json")
            })
            .collect::<Vec<_>>();
        files.sort();
        let snapshots = files
            .iter()
            .map(|path| read_snapshot(path))
            .collect::<Result<Vec<_>>>()?;
        Ok(SnapshotBatch { files, snapshots })
    }

    pub fn acknowledge(&self, batch: &SnapshotBatch) -> Result<()> {
        for path in &batch.files {
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(error).with_context(|| {
                        format!("could not acknowledge snapshot {}", path.display())
                    });
                }
            }
        }
        Ok(())
    }
}

fn snapshot_file_identity() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = SNAPSHOT_FILE_ID.fetch_add(1, Ordering::Relaxed);
    format!("{timestamp:020}-{:010}-{sequence:020}", std::process::id())
}

fn read_snapshot(path: &Path) -> Result<HostSnapshot> {
    let value = fs::read(path)
        .with_context(|| format!("could not read collected snapshot {}", path.display()))?;
    serde_json::from_slice(&value)
        .with_context(|| format!("collected snapshot {} is invalid", path.display()))
}

#[cfg(test)]
#[path = "snapshot_store_tests.rs"]
mod tests;
