use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::broadcast;

/// Maximum number of log lines to keep per job.
const MAX_LOG_LINES_PER_JOB: usize = 500;

/// Events pushed to WebSocket clients.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event")]
pub enum WsEvent {
    #[serde(rename = "job:progress")]
    JobProgress {
        job_id: String,
        phase: String,
        percent: f64,
        throughput_bytes_per_sec: u64,
        eta_seconds: i64,
        current_item: String,
    },
    #[serde(rename = "job:status")]
    JobStatus {
        job_id: String,
        status: String,
        error_message: Option<String>,
    },
    #[serde(rename = "job:log")]
    JobLog {
        job_id: String,
        level: String,
        message: String,
        timestamp: String,
    },
    #[serde(rename = "asset:health")]
    AssetHealth {
        asset_id: String,
        status: String,
        message: String,
    },
}

/// A single log entry stored in the buffer.
#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub level: String,
    pub message: String,
    pub timestamp: String,
}

/// Ring buffer that stores recent log events per job.
pub struct LogBuffer {
    entries: Mutex<HashMap<String, Vec<LogEntry>>>,
}

impl LogBuffer {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    /// Add a log entry for a job. Trims old entries if over the limit.
    pub fn push(&self, job_id: &str, entry: LogEntry) {
        let mut map = self.entries.lock().unwrap();
        let logs = map.entry(job_id.to_string()).or_insert_with(Vec::new);
        if logs.len() >= MAX_LOG_LINES_PER_JOB {
            logs.remove(0);
        }
        logs.push(entry);
    }

    /// Get all log entries for a job.
    pub fn get(&self, job_id: &str) -> Vec<LogEntry> {
        self.entries.lock().unwrap()
            .get(job_id)
            .cloned()
            .unwrap_or_default()
    }
}

/// Broadcast channel for pushing events to all connected WebSocket clients.
pub struct ProgressBus {
    tx: broadcast::Sender<WsEvent>,
    log_buffer: LogBuffer,
}

impl ProgressBus {
    /// Create a new ProgressBus with room for `capacity` events.
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self {
            tx,
            log_buffer: LogBuffer::new(),
        }
    }

    /// Subscribe to receive all future events.
    pub fn subscribe(&self) -> broadcast::Receiver<WsEvent> {
        self.tx.subscribe()
    }

    /// Push a job progress event.
    pub fn job_progress(
        &self,
        job_id: &str,
        phase: &str,
        percent: f64,
        throughput_bytes_per_sec: u64,
        eta_seconds: i64,
        current_item: &str,
    ) {
        let _ = self.tx.send(WsEvent::JobProgress {
            job_id: job_id.to_string(),
            phase: phase.to_string(),
            percent,
            throughput_bytes_per_sec,
            eta_seconds,
            current_item: current_item.to_string(),
        });
    }

    /// Push a job status change event.
    pub fn job_status(&self, job_id: &str, status: &str, error_message: Option<&str>) {
        let _ = self.tx.send(WsEvent::JobStatus {
            job_id: job_id.to_string(),
            status: status.to_string(),
            error_message: error_message.map(|s| s.to_string()),
        });
    }

    /// Push a job log line event.
    pub fn job_log(&self, job_id: &str, level: &str, message: &str) {
        use chrono::Utc;
        let timestamp = Utc::now().to_rfc3339();

        // Store in the log buffer
        self.log_buffer.push(job_id, LogEntry {
            level: level.to_string(),
            message: message.to_string(),
            timestamp: timestamp.clone(),
        });

        let _ = self.tx.send(WsEvent::JobLog {
            job_id: job_id.to_string(),
            level: level.to_string(),
            message: message.to_string(),
            timestamp,
        });
    }

    /// Push an asset health alert event.
    pub fn asset_health(&self, asset_id: &str, status: &str, message: &str) {
        let _ = self.tx.send(WsEvent::AssetHealth {
            asset_id: asset_id.to_string(),
            status: status.to_string(),
            message: message.to_string(),
        });
    }

    /// Get buffered log entries for a job.
    pub fn get_job_logs(&self, job_id: &str) -> Vec<LogEntry> {
        self.log_buffer.get(job_id)
    }
}

impl Default for ProgressBus {
    fn default() -> Self {
        Self::new(256)
    }
}
