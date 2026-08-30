import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[AgenticControlRoom] render crash:", error.message, "\n", error.stack, "\n", info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", whiteSpace: "pre-wrap", color: "#F0E7D6", background: "#1B1814", height: "100vh", overflow: "auto" }}>
          <div style={{ fontSize: 16, marginBottom: 12 }}>Agentic Control Room crashed</div>
          <div style={{ color: "#D67F48", marginBottom: 12 }}>{this.state.error.message}</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{this.state.error.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
