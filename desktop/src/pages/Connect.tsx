import { useState } from "react";
import { parseAgentError, type AgentError } from "../api/client";

interface Props {
  onConnect: (url: string, token: string) => void;
  error: string | null;
  initialUrl?: string;
  initialToken?: string;
}

export default function ConnectPage({ onConnect, error, initialUrl, initialToken }: Props) {
  const [url, setUrl] = useState(initialUrl || "http://127.0.0.1:8787");
  const [token, setToken] = useState(initialToken || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConnect(url, token);
  }

  const parsedError: AgentError | null = error ? parseAgentError(error) : null;

  return (
    <div className="connect-page">
      <div className="glass-card connect-card">
        <h1>Bifrost Desktop</h1>
        <p className="subtitle">Connect to a Bifrost Agent</p>
        <form onSubmit={handleSubmit} className="connect-form">
          <label>
            Agent URL
            <input
              className="glass-input"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:8787"
            />
          </label>
          <label>
            Auth Token
            <input
              className="glass-input"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="64-character hex token"
            />
          </label>
          <p className="hint">
            Find the token in your agent&apos;s data directory (e.g. <code>/var/lib/bifrost-agent/agent.key</code>)
          </p>
          {parsedError && (
            <div className={`connect-error connect-error-${parsedError.code}`}>
              <span className="connect-error-icon">
                {parsedError.code === "auth" ? "🔒" : parsedError.code === "network" ? "📡" : parsedError.code === "timeout" ? "⏱" : "⚠"}
              </span>
              <span>{parsedError.message}</span>
            </div>
          )}
          <button className="btn-primary btn-lg" type="submit">
            Connect
          </button>
        </form>
      </div>
    </div>
  );
}
