"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[300px] flex items-center justify-center px-4">
          <div className="bg-surface border border-border rounded-lg p-8 max-w-md text-center" role="alert">
            <p className="text-sm font-semibold text-danger mb-2">
              Application error
            </p>
            <p className="text-sm text-text2 mb-4">
              {this.state.error.message || "An unexpected error occurred. Reload the page to try again."}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="text-sm text-primary hover:text-primary-hover transition-colors font-medium px-4 py-2.5 rounded-md"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
