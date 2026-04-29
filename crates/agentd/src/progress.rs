use serde::Serialize;
use tokio::sync::broadcast;

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

/// Broadcast channel for pushing events to all connected WebSocket clients.
pub struct ProgressBus {
    tx: broadcast::Sender<WsEvent>,
}

impl ProgressBus {
    /// Create a new ProgressBus with room for `capacity` events.
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
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
        let _ = self.tx.send(WsEvent::JobLog {
            job_id: job_id.to_string(),
            level: level.to_string(),
            message: message.to_string(),
            timestamp: Utc::now().to_rfc3339(),
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
}

impl Default for ProgressBus {
    fn default() -> Self {
        Self::new(256)
    }
}
