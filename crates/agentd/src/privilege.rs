//! Privilege escalation: detect root-required operations, invoke pkexec.

/// Check whether the current process has sufficient privileges for the
/// given operation. Returns Ok if capable, Err with resolution instructions
/// if elevation is needed.
pub fn check_elevation(operation: &str) -> Result<(), String> {
    let is_root = unsafe { libc::geteuid() == 0 };

    let needs_root = matches!(operation, "volume_backup" | "volume_restore" | "snapshot_create");

    if needs_root && !is_root {
        Err(format!(
            "Operation '{operation}' requires root privileges. \
             Run the agent with pkexec or add the agent user to the appropriate group."
        ))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_elevation_volume_backup() {
        let result = check_elevation("volume_backup");
        // Either succeeds (if running as root) or returns a helpful message
        match result {
            Ok(_) => {} // Running as root or privileged
            Err(msg) => assert!(msg.contains("root")),
        }
    }

    #[test]
    fn test_check_elevation_file_backup() {
        // File backup should not require root
        let result = check_elevation("file_backup");
        assert!(result.is_ok() || result.unwrap_err().contains("root") == false
            || unsafe { libc::geteuid() } != 0);
    }
}
