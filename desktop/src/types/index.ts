export interface HealthResponse {
  status: string;
  version: string;
  uptime_seconds: number;
  db_ok: boolean;
  queue_depth: number;
}

export interface AgentInfoResponse {
  version: string;
  platform: string;
  backends: string[];
  capabilities: string[];
  uptime_seconds: number;
}

export interface AssetConfig {
  type: "Fileset" | "Volume" | "NasShare";
  paths?: string[];
  consistency_mode?: boolean;
  exclude_patterns?: string[];
  backend?: string;
  volume_id?: string;
  url?: string;
  credential_id?: string | null;
}

export interface AssetResponse {
  id: string;
  name: string;
  kind: string;
  config?: AssetConfig;
  sla_policy?: SLAPolicyResponse | null;
  protection_active: boolean;
  enabled: boolean;
  health: string;
  last_backup: string | null;
  next_backup: string | null;
  created_at: string;
}

export interface SLAPolicyResponse {
  id: string;
  name: string;
  copy_mode: string;
  backup_type: string;
  schedule_cron: string;
  block_size: number;
  subtask_count: number;
  memory_limit_mb: number;
  retention_kind: string;
  retention_value: number;
  aggregate_config?: { max_blob_size: number; file_threshold: number; shard_count: number } | null;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobResponse {
  id: string;
  asset_id: string;
  operation: string;
  status: string;
  progress?: JobProgress | null;
  size_bytes: number | null;
  file_count: number | null;
  error_count: number;
  started_at: string | null;
  ended_at: string | null;
}

export interface JobProgress {
  phase: string;
  percent: number;
  throughput_bytes_per_sec: number;
  eta_seconds: number;
  current_item: string;
}

export interface BackupCopyResponse {
  id: string;
  asset_id: string;
  job_id: string;
  kind: string;
  copy_uuid: string | null;
  parent_copy_id: string | null;
  size_bytes: number | null;
  file_count: number | null;
  manifest_path: string | null;
  data_path: string | null;
  expires_at: string | null;
  status: string;
  created_at: string;
}

export interface DirEntry {
  name: string;
  path: string;
  kind: string;
  size: number;
  modified: string;
  mode: number;
}

export interface RestoreRequest {
  asset_id: string;
  copy_id: string;
  entries: { path: string; kind: string }[];
  destination: { kind: "Original" } | { kind: "New"; path: string };
  conflict_policy: string;
}

export type Operation = "backup" | "restore" | "snapshot";
