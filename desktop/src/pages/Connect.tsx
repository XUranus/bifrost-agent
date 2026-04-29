import { useState } from "react";

interface Props {
  onConnect: (url: string, token: string) => void;
  error: string | null;
}

export default function ConnectPage({ onConnect, error }: Props) {
  const [url, setUrl] = useState("http://127.0.0.1:8700");
  const [token, setToken] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConnect(url, token);
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Bifrost Desktop</h1>
        <p style={styles.subtitle}>Connect to a Bifrost Agent</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Agent URL
            <input
              style={styles.input}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:8700"
            />
          </label>
          <label style={styles.label}>
            Auth Token
            <input
              style={styles.input}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="64-character hex token"
            />
          </label>
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit">
            Connect
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    backgroundColor: "#1a1a2e",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 40,
    width: 400,
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  },
  title: { fontSize: 24, fontWeight: 700, textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 24 },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  label: { fontSize: 13, fontWeight: 600, color: "#333", display: "flex", flexDirection: "column", gap: 6 },
  input: {
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid #ddd",
    fontSize: 14,
    outline: "none",
  },
  error: { color: "#e53e3e", fontSize: 13, padding: "8px 12px", backgroundColor: "#fff5f5", borderRadius: 6 },
  button: {
    padding: "12px 0",
    backgroundColor: "#6c63ff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
  },
};
