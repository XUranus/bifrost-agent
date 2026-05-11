import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface JobStatusPayload {
  event: "job:status";
  job_id: string;
  status: string;
  error_message: string | null;
}

interface JobLogPayload {
  event: "job:log";
  job_id: string;
  level: string;
  message: string;
  timestamp: string;
}

interface JobProgressPayload {
  event: "job:progress";
  job_id: string;
  phase: string;
  percent: number;
  throughput_bytes_per_sec: number;
  eta_seconds: number;
  current_item: string;
}

interface AssetHealthPayload {
  event: "asset:health";
  asset_id: string;
  status: string;
  message: string | null;
}

type WsEvent = JobStatusPayload | JobLogPayload | JobProgressPayload | AssetHealthPayload;

export function useAgentEvents(callbacks: {
  onJobStatus?: (e: JobStatusPayload) => void;
  onJobLog?: (e: JobLogPayload) => void;
  onJobProgress?: (e: JobProgressPayload) => void;
  onAssetHealth?: (e: AssetHealthPayload) => void;
}) {
  const refs = useRef(callbacks);
  refs.current = callbacks;

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    listen<string>("ws:event", (event) => {
      try {
        const data: WsEvent = JSON.parse(event.payload);
        switch (data.event) {
          case "job:status":
            refs.current.onJobStatus?.(data);
            break;
          case "job:log":
            refs.current.onJobLog?.(data);
            break;
          case "job:progress":
            refs.current.onJobProgress?.(data);
            break;
          case "asset:health":
            refs.current.onAssetHealth?.(data);
            break;
        }
      } catch {
        // ignore parse errors
      }
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);
}

/**
 * Subscribe to job:log events for a specific job.
 * Returns a stable callback ref for the listener.
 */
export function useJobLogEvents(
  jobId: string,
  onLog: (entry: { level: string; message: string; timestamp: string }) => void
) {
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    listen<string>("ws:event", (event) => {
      try {
        const data = JSON.parse(event.payload);
        if (data.event === "job:log" && data.job_id === jobId) {
          onLogRef.current({ level: data.level, message: data.message, timestamp: data.timestamp });
        }
      } catch {
        // ignore
      }
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [jobId]);
}
