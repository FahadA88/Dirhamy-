import { Component, ErrorInfo, ReactNode } from 'react';

// A thrown render error used to blank the whole page. Now it's contained, explained, and
// recoverable — and it prints the stack so a bad game definition can actually be diagnosed.
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Decky caught a render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash glass" role="alert">
        <h3>Something in {this.props.label ?? 'the app'} broke</h3>
        <p className="muted">
          This is a bug, not something you did. The details are in the browser console.
        </p>
        <pre className="crash-detail">{String(this.state.error?.message ?? this.state.error)}</pre>
        <div className="crash-actions">
          <button className="ghost" onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
