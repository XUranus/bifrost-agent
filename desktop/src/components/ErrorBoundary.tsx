import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error(`[ErrorBoundary${this.props.name ? ` ${this.props.name}` : ""}]:`, error, info);
  }

  handleReload = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-panel" style={{ margin: 32, padding: 32, textAlign: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--status-error)", marginBottom: 12 }}>
            {this.state.error?.message || "Something went wrong"}
          </h2>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn-primary" onClick={this.handleReload}>Dashboard</button>
            <button className="btn-secondary" onClick={() => this.setState({ hasError: false, error: null })}>
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
