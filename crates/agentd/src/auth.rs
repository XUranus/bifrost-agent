use ring::rand::{SecureRandom, SystemRandom};
use std::fs;
use std::path::Path;

/// Generate a new 32-byte random token and write it to `token_path`.
/// Returns the hex-encoded token string.
pub fn initialize_token(token_path: &Path) -> Result<String, anyhow::Error> {
    let rng = SystemRandom::new();
    let mut bytes = [0u8; 32];
    rng.fill(&mut bytes)
        .map_err(|e| anyhow::anyhow!("Failed to generate token: {e}"))?;

    let hex = hex_encode(&bytes);

    if let Some(parent) = token_path.parent() {
        fs::create_dir_all(parent)?;
    }
    // Restrict permissions: only owner can read
    fs::write(token_path, &hex)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(token_path, fs::Permissions::from_mode(0o600))?;
    }

    tracing::info!("Agent token written to {}", token_path.display());
    Ok(hex)
}

/// Load the token from disk. Returns an error if the file does not exist
/// (caller should call `initialize_token` first).
pub fn load_token(token_path: &Path) -> Result<String, anyhow::Error> {
    let hex = fs::read_to_string(token_path)?;
    Ok(hex.trim().to_string())
}

/// Get or create the agent token.
pub fn get_or_create_token(token_path: &Path) -> Result<String, anyhow::Error> {
    if token_path.exists() {
        load_token(token_path)
    } else {
        initialize_token(token_path)
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_token_lifecycle() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("agent.key");

        // First call creates
        let token = get_or_create_token(&path).unwrap();
        assert_eq!(token.len(), 64); // 32 bytes in hex
        assert!(path.exists());

        // Second call loads same token
        let token2 = get_or_create_token(&path).unwrap();
        assert_eq!(token, token2);
    }
}
