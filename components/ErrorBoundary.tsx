'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Short label shown in the fallback UI, e.g. "Vault" or "Presentation" */
  section?: string;
  /** Optional custom fallback to render instead of the default */
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Wraps a section in a React error boundary so that one broken component
 * shows a small inline fallback instead of white-screening the whole app.
 *
 * Usage:
 *   <ErrorBoundary section="Vault">
 *     <VaultPage />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for dev visibility — swap for a real error tracker in prod
    console.error(`[ErrorBoundary/${this.props.section || 'App'}]`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-4 p-8 min-h-[240px] text-center border border-red-900/40 rounded-xl bg-red-950/10 font-mono"
        >
          {/* Batman-themed icon */}
          <span className="text-4xl select-none">🦇</span>
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-[3px] text-red-400">
              {this.props.section ? `${this.props.section} ` : ''}Section Error
            </p>
            <p className="text-[10px] text-zinc-500 max-w-xs leading-relaxed uppercase tracking-wider">
              {this.state.errorMessage}
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className="px-4 py-1.5 border border-red-800/50 hover:border-red-500 bg-red-950/30 hover:bg-red-950/60 text-red-400 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            [ Retry ]
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
