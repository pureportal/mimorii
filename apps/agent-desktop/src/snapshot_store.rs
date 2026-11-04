use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};

use crate::models::HostSnapshot;

static SNAPSHOT_FILE_ID: AtomicU64 = AtomicU64::new(0);

const MAX_RETAINED_SNAPSHOTS: usize = 2_880;
const MAX_BATCH_SNAPSHOTS: usize = 120;
const MAX_BATCH_BYTES: u64 = 8 * 1024 * 1024;

pub struct SnapshotBatch {
    files: Vec<PathBuf>,
    snapshots: Vec<HostSnapshot>,
    pub discarded: usize,
}

impl SnapshotBatch {
    pub fn snapshots(&self) -> &[HostSnapshot] {
        &self.snapshots
    }
}

#[derive(Clone)]
pub struct SnapshotStore {
    directory: PathBuf,
    retained_snapshots: usize,
    batch_snapshots: usize,
    batch_bytes: u64,
}

impl SnapshotStore {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            retained_snapshots: MAX_RETAINED_SNAPSHOTS,
            batch_snapshots: MAX_BATCH_SNAPSHOTS,
            batch_bytes: MAX_BATCH_BYTES,
        }
    }

    #[cfg(test)]
    pub fn with_limits(
        directory: PathBuf,
        retained_snapshots: usize,
        batch_snapshots: usize,
        batch_bytes: u64,
    ) -> Self {
        Self {
            directory,
            retained_snapshots,
            batch_snapshots,
            batch_bytes,
        }
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
        self.prune()
    }

    pub fn load(&self) -> Result<SnapshotBatch> {
        let mut batch = SnapshotBatch {
            files: Vec::new(),
            snapshots: Vec::new(),
            discarded: 0,
        };
        let mut bytes = 0;
        for (path, size) in self.committed_files()? {
            if batch.snapshots.len() == self.batch_snapshots
                || (!batch.snapshots.is_empty() && bytes + size > self.batch_bytes)
            {
                break;
            }
            let Some(snapshot) = self.read_or_discard(&path)? else {
                batch.discarded += 1;
                continue;
            };
            bytes += size;
            batch.files.push(path);
            batch.snapshots.push(snapshot);
        }
        Ok(batch)
    }

    pub fn latest(&self) -> Result<Option<HostSnapshot>> {
        for (path, _) in self.committed_files()?.into_iter().rev() {
            if let Some(snapshot) = self.read_or_discard(&path)? {
                return Ok(Some(snapshot));
            }
        }
        Ok(None)
    }

    pub fn pending(&self) -> Result<usize> {
        Ok(self.committed_files()?.len())
    }

    pub fn acknowledge(&self, batch: &SnapshotBatch) -> Result<()> {
        for path in &batch.files {
            remove_if_present(path)
                .with_context(|| format!("could not acknowledge snapshot {}", path.display()))?;
        }
        Ok(())
    }

    pub fn clear(&self) -> Result<()> {
        if !self.directory.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(&self.directory)? {
            let path = entry?.path();
            if path.is_file()
                && path
                    .extension()
                    .is_some_and(|extension| extension == "json" || extension == "pending")
            {
                fs::remove_file(&path).with_context(|| {
                    format!("could not remove collected snapshot {}", path.display())
                })?;
            }
        }
        Ok(())
    }

    fn prune(&self) -> Result<()> {
        let files = self.committed_files()?;
        let excess = files.len().saturating_sub(self.retained_snapshots);
        for (path, _) in files.into_iter().take(excess) {
            remove_if_present(&path)
                .with_context(|| format!("could not prune snapshot {}", path.display()))?;
        }
        Ok(())
    }

    fn committed_files(&self) -> Result<Vec<(PathBuf, u64)>> {
        if !self.directory.exists() {
            return Ok(Vec::new());
        }
        let mut files = Vec::new();
        for entry in fs::read_dir(&self.directory)? {
            let entry = entry?;
            let path = entry.path();
            if path
                .extension()
                .is_some_and(|extension| extension == "json")
            {
                files.push((path, entry.metadata()?.len()));
            }
        }
        files.sort();
        Ok(files)
    }

    fn read_or_discard(&self, path: &Path) -> Result<Option<HostSnapshot>> {
        let value = match fs::read(path) {
            Ok(value) => value,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("could not read collected snapshot {}", path.display())
                });
            }
        };
        match serde_json::from_slice(&value) {
            Ok(snapshot) => Ok(Some(snapshot)),
            Err(_) => {
                remove_if_present(path).with_context(|| {
                    format!("could not discard unreadable snapshot {}", path.display())
                })?;
                Ok(None)
            }
        }
    }
}

fn remove_if_present(path: &Path) -> std::io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        result => result,
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

#[cfg(test)]
#[path = "snapshot_store_tests.rs"]
mod tests;
