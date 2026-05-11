use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentProfile {
    pub name: String,
    pub url: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub agent_url: Option<String>,
    pub agent_token: Option<String>,
    pub theme: String,
    pub window_width: Option<u32>,
    pub window_height: Option<u32>,
    pub agent_profiles: Vec<AgentProfile>,
    pub active_profile: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            agent_url: Some("http://127.0.0.1:8787".into()),
            agent_token: None,
            theme: "system".into(),
            window_width: None,
            window_height: None,
            agent_profiles: Vec::new(),
            active_profile: None,
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
        let mut settings: Settings = serde_json::from_str(&data)?;
        // Migrate: if no profiles but has agent_url, create a default profile
        if settings.agent_profiles.is_empty() {
            if let Some(url) = &settings.agent_url {
                settings.agent_profiles.push(AgentProfile {
                    name: "Default".into(),
                    url: url.clone(),
                    token: settings.agent_token.clone().unwrap_or_default(),
                });
                settings.active_profile = Some("Default".into());
            }
        }
        Ok(settings)
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
