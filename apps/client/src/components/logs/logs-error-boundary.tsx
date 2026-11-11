import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "../page-state";

export class LogsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return <ErrorState retry={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}
