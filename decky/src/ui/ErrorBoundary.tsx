import { Component, ErrorInfo, ReactNode } from 'react';

// A thrown render error used to blank the whole page. Now it's contained, explained, and
// recoverable — and it prints the stack so a bad game definition can actually be diagnosed.
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null; componentStack: string; copied: boolean }
> {
  state = { error: null as Error | null, componentStack: '', copied: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Decky caught a render error', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  // Everything a bug report actually needs, in one block a player can paste without opening
  // devtools — this used to live only in the console, which is not somewhere most players
  // have ever looked, let alone would think to check while reporting a crash.
  copyDiagnostics = () => {
    const { error, componentStack } = this.state;
    const report = [
      `Decky crash report — ${new Date().toISOString()}`,
      `Where: ${this.props.label ?? 'the app'}`,
      `URL: ${window.location.href}`,
      `Browser: ${navigator.userAgent}`,
      '',
      String(error?.stack ?? error?.message ?? error),
      componentStack ? `\nComponent stack:${componentStack}` : '',
    ].join('\n');
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(report)
      .then(() => this.setState({ copied: true }))
      .catch(() => { /* clipboard permission denied — the button just won't confirm */ });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash glass" role="alert">
        <h3>Something in {this.props.label ?? 'the app'} broke</h3>
        <p className="muted">
          This is a bug, not something you did.
        </p>
        <pre className="crash-detail">{String(this.state.error?.message ?? this.state.error)}</pre>
        <div className="crash-actions">
          <button className="ghost" onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="ghost" onClick={this.copyDiagnostics}>
            {this.state.copied ? 'Copied' : 'Copy details'}
          </button>
          <button className="primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
