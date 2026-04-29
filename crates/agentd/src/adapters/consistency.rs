//! Consistency backup orchestrator: vpt-rs snapshot + bifrost file scan.

/// Orchestrates a consistency backup: takes snapshots of the volume(s) containing
/// the fileset paths, then runs a file backup against the snapshot mount points.
pub struct ConsistencyAdapter;

impl ConsistencyAdapter {
    pub fn new() -> Self {
        Self
    }
}

// Stub — full implementation will be filled in during Week 9-10.
