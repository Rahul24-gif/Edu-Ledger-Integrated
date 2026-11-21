import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error?.message || 'An unexpected error occurred.';
    // Parse structured Firestore error payload if present
    try {
      const parsed = JSON.parse(readable);
      if (parsed && typeof parsed === 'object' && parsed.error) {
        readable = `Cloud sync permission error (${parsed.operationType || 'operation'} on ${parsed.path || 'database'}): ${parsed.error}`;
      }
    } catch {
      // plain error message
    }
    return {
      hasError: true,
      errorMessage: readable,
    };
  }

  componentDidCatch(error: Error) {
    console.error('SciFee ErrorBoundary caught error:', error);
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#faf8ff] text-[#131b2e] flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg border border-[#f2f3ff] space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[#ffdad6] p-2.5 text-[#ba1a1a] shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-base font-bold text-[#131b2e]">
                  Something went wrong
                </h1>
                <p className="mt-1 text-xs text-[#3e4947] leading-relaxed">
                  Your saved student ledgers in browser storage are safe. Reload
                  the workspace to continue.
                </p>
              </div>
            </div>

            {this.state.errorMessage && (
              <div className="rounded-xl bg-[#faf8ff] border border-[#eaedff] p-3 text-[11px] font-mono text-[#3e4947] break-words">
                {this.state.errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  this.setState({ hasError: false, errorMessage: '' })
                }
                className="rounded-xl bg-[#f2f3ff] px-3.5 py-2 text-xs font-semibold text-[#131b2e] hover:bg-[#e2e7ff] transition-colors"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#005c55] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e] transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reload Workspace
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
