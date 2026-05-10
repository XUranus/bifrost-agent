// API client using Tauri invoke bridge to the Rust backend commands.

import { invoke } from "@tauri-apps/api/core";
import type {
  HealthResponse,
  AgentInfoResponse,
  AssetResponse,
  SLAPolicyResponse,
  JobResponse,
  BackupCopyResponse,
  DirEntry,
} from "../types";

// Agent connection
export async function connectAgent(url: string, token: string): Promise<void> {
  return invoke("connect_agent", { url, token });
}

export async function disconnectAgent(): Promise<void> {
  return invoke("disconnect_agent");
}

export async function getSettings(): Promise<{
  agent_url: string | null;
  agent_token: string | null;
  theme: string;
  window_width: number | null;
  window_height: number | null;
}> {
  return invoke("get_settings");
}

export async function getAgentInfo(): Promise<AgentInfoResponse> {
  return invoke("get_agent_info");
}

export async function getHealth(): Promise<HealthResponse> {
  return invoke("get_health");
}

// Assets
export async function listAssets(): Promise<AssetResponse[]> {
  return invoke("list_assets");
}

export async function getAsset(id: string): Promise<AssetResponse> {
  return invoke("get_asset", { id });
}

export async function createAsset(body: unknown): Promise<unknown> {
  return invoke("create_asset", { body });
}

export async function updateAsset(id: string, body: unknown): Promise<unknown> {
  return invoke("update_asset", { id, body });
}

export async function deleteAsset(id: string, keepCopies?: boolean): Promise<unknown> {
  return invoke("delete_asset", { id, keepCopies });
}

export async function testAsset(id: string): Promise<unknown> {
  return invoke("test_asset", { id });
}

// SLA Policies
export async function listSLAPolicies(): Promise<SLAPolicyResponse[]> {
  return invoke("list_sla_policies");
}

export async function createSLAPolicy(body: unknown): Promise<unknown> {
  return invoke("create_sla_policy", { body });
}

export async function getSLAPolicy(id: string): Promise<SLAPolicyResponse> {
  return invoke("get_sla_policy", { id });
}

export async function updateSLAPolicy(id: string, body: unknown): Promise<unknown> {
  return invoke("update_sla_policy", { id, body });
}

export async function deleteSLAPolicy(id: string): Promise<unknown> {
  return invoke("delete_sla_policy", { id });
}

// Jobs
export async function listJobs(params?: {
  asset_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<JobResponse[]> {
  return invoke("list_jobs", {
    assetId: params?.asset_id ?? null,
    status: params?.status ?? null,
    limit: params?.limit ?? null,
    offset: params?.offset ?? null,
  });
}

export async function getJob(id: string): Promise<JobResponse> {
  return invoke("get_job", { id });
}

export async function startJob(assetId: string, operation: string): Promise<JobResponse> {
  return invoke("start_job", { assetId, operation });
}

export async function cancelJob(id: string): Promise<unknown> {
  return invoke("cancel_job", { id });
}

export async function getJobLogs(
  id: string
): Promise<{ lines: { level: string; message: string; timestamp: string }[] }> {
  return invoke("get_job_logs", { id });
}

// Backup Copies
export async function listBackupCopies(assetId: string): Promise<BackupCopyResponse[]> {
  return invoke("list_backup_copies", { assetId });
}

export async function deleteBackupCopy(id: string): Promise<unknown> {
  return invoke("delete_backup_copy", { id });
}

// Restore
export async function startRestore(body: unknown): Promise<JobResponse> {
  return invoke("start_restore", { body });
}

// Browse
export async function browseCopy(copyId: string, path?: string): Promise<DirEntry[]> {
  return invoke("browse_copy", { copyId, path: path ?? null });
}
