use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub agent_url: Option<String>,
    pub agent_token: Option<String>,
    pub theme: String,
    pub window_width: Option<u32>,
    pub window_height: Option<u32>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            agent_url: Some("http://127.0.0.1:8787".into()),
            agent_token: None,
            theme: "system".into(),
            window_width: None,
            window_height: None,
        }
    }
}

fn settings_path() -> PathBuf {
    dirs_next().unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("bifrost-desktop")
        .join("settings.json")
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

pub fn load_settings() -> Result<Settings, anyhow::Error> {
    let path = settings_path();
    if path.exists() {
        let data = std::fs::read_to_string(&path)?;
        Ok(serde_json::from_str(&data)?)
    } else {
        let settings = Settings::default();
        save_settings(&settings)?;
        Ok(settings)
    }
}

pub fn save_settings(settings: &Settings) -> Result<(), anyhow::Error> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(settings)?)?;
    Ok(())
}
